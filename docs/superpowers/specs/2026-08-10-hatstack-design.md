# hatstack — design

Date: 2026-08-10
Status: approved (design), not yet implemented

## Problem

The daily agentic loop has four failure modes, and prompt text alone does not prevent any of them:

1. The agent picks an approach in its own head, then writes a plan arguing for it. Alternatives arrive as strawmen and the human rubber-stamps.
2. Implementation lands before any test exists. Tests written afterwards are shaped to the code and cannot fail.
3. The agent that wrote the code reviews the code. It reviews its own intent, not its output.
4. Only coding is covered. The same discipline is wanted for SEO, marketing, accounting, and strategy work.

Prompt text erodes under context pressure. Enforcement has to survive a long session, and it has to survive being run under an agent other than Claude Code.

## Constraints

- **Portability is a hard requirement, but not at the cost of enforcement.** Claude Code is the primary target and keeps hard pre-write gates. Codex, Gemini CLI, and Cursor/Windsurf must run the same loop; where a harness has no pre-write deny primitive, enforcement degrades to instruction text plus a git pre-commit gate. This asymmetry is stated, not hidden.
- Zero runtime dependencies. Node ≥ 20 only (built-in `fetch`, `node:test`). The prior sketch required `jq`; that dependency goes away.
- Gate logic lives in exactly one place. Every harness adapter is a translation of an exit code, never a reimplementation.
- Escape hatches exist and are deliberate, never reflexive.
- Non-code hats get the same three-phase loop with no test runner in sight.

## Success criteria

- `hatstack check plan` denies on a plan with 2 approaches, a missing `Cons` block, or no `APPROVED:` line; allows on a well-formed approved plan.
- `hatstack check tdd` denies a source write when the last recorded test run was green and older than the refactor window; allows during the window; allows on red.
- A green run followed immediately by a source edit succeeds (refactor is possible). The same edit 11 minutes later is denied.
- `hatstack check accept` denies a write to `briefs/x.md` under a plan with no `## Success criteria`, and allows once one unticked criterion exists.
- `hatstack review eng` produces a report file written by a process that never saw the building agent's context, and exits non-zero on a BLOCK verdict.
- With no reviewer CLI installed, `hatstack review` exits 3 and reports review unavailable. It never falls back to self-review.
- The same `hatstack check tdd` invocation produces identical decisions when called from a Claude Code hook, a git pre-commit hook, and a bare shell.
- hatstack's own test suite is written test-first and passes under `node --test`.

## Architecture

One repo. The portable core is a zero-dependency Node CLI; everything else is markdown and thin adapters.

```
bin/hatstack.mjs                 CLI entry: check | test | review | media | init
lib/
  plan.mjs                       parse plan markdown -> {approaches[], criteria[], approved}
  state.mjs                      read/write .hatstack/state.json, TDD state machine
  gates.mjs                      check plan | check tdd | check accept -> {ok, reason}
  review.mjs                     reviewer CLI detection + dispatch + report capture
  media.mjs                      fal / openrouter providers + provenance manifest
  config.mjs                     .hatstack/config.json load + defaults
hats/
  eng/{plan.md,build.md,reviewer.md}
  seo/{plan.md,reviewer.md}
  marketing/{plan.md,reviewer.md}
  accounting/{plan.md,reviewer.md}
  ceo/{plan.md,reviewer.md}
skills/
  three-approaches/SKILL.md
  red-green-refactor/SKILL.md
  adversarial-review/SKILL.md
adapters/
  claude-code/                   plugin.json, commands/, agents/, hooks/ (exit code -> JSON)
  codex/AGENTS.md
  gemini/GEMINI.md
  cursor/.cursorrules
  git/pre-commit
test/                            node:test, mirrors lib/
```

Deliberately **one** Claude Code plugin rather than seven. Hats are rubric files enabled in config; a marketplace fan-out only earns its keep when a hat needs its own MCP server or dependencies.

### The gate contract

Every gate is a subprocess with a three-valued exit code and a plain-text reason on stdout:

| Exit | Meaning |
|---|---|
| 0 | allow |
| 2 | deny — reason on stdout, addressed to the agent |
| 3 | cannot evaluate (missing tool, unreadable state) — treated as deny |

Nothing about Claude Code appears in `lib/`. Adapters translate:

- **Claude Code** — `hooks/pre-write.sh` runs the CLI and maps the exit code to `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow|deny","permissionDecisionReason":"<stdout>"}}`. Hard, pre-write.
- **git** — `adapters/git/pre-commit` runs every applicable check against the staged set and exits non-zero. Commit-time, not write-time, but identical on every harness including agents that ignore their instruction file.
- **Codex / Gemini / Cursor** — instruction files telling the agent to run `hatstack check` before writing. Soft. The pre-commit hook is the backstop.

`hatstack init` writes `.hatstack/`, installs the git hook, and drops the adapter files the project asks for.

## Components

### Plan gate

Parses `.hatstack/plans/<slug>.md` named by `.hatstack/active-plan`. Gate is inert when no active plan exists — ad-hoc work is unaffected.

Requires: ≥3 `## Approach N` sections, each carrying **Pros**, **Cons**, **Reversibility**, and **Cost**, plus a non-empty `APPROVED:` line. `Cost` is enforced — the prior sketch's script checked three of the four the template demanded; the template is authoritative.

The agent is instructed never to write the `APPROVED:` line on its own authority. It is the human's signature, collected via the harness's question primitive (Claude `AskUserQuestion`, plain prompt elsewhere).

Constrained-space escape: if only two genuine strategies exist, the plan states so in a `## Constrained space` section naming the disqualified third and why. The gate accepts that section in place of the third approach. Padding with a fake option is the failure this prevents; an honest count is not.

### TDD gate and state machine

```
        red (test failed)          source writes ALLOWED
          |  test passes
          v
        green (refactor window)    source writes ALLOWED, window_expires = now + 600s
          |  window expires
          v
        locked                     source writes DENIED until next red
```

State lives in `.hatstack/state.json`: `{status, command, ts, window_expires}`. RED older than `tdd_state_max_age_seconds` (default 1800) is stale and denies — yesterday's failure cannot authorise today's code.

The state is never self-reported. Two recorders, same writer function:

- `hatstack test -- <cmd>` runs the command, streams output, records status from the real exit code. Works on every harness.
- Claude Code `PostToolUse` on Bash matches the configured `test_command_pattern` and records automatically, so the loop stays frictionless where it can.

Path classification (unchanged from the sketch, it was right): tests, fixtures, docs, config, and `.hatstack/` are never gated — you must always be able to write the failing test. Only paths under `src_globs` are guarded.

Escape hatches: `HATSTACK_TDD_OFF=1`, or `"tdd_gate": "off"` in config.

### Acceptance gate (non-code hats)

Non-code work has no test runner, so this gate is weaker than the TDD gate and the spec says so plainly: it is a **presence check at write time plus verification at review time**, not a two-state machine. Nothing at write time can tell whether a brief is good; only the reviewer can. The plan's `## Success criteria` section holds checkboxes:

```markdown
## Success criteria
- [ ] 12 target keywords mapped to existing URLs
- [ ] every brief states search intent and the SERP gap it exploits
```

`hatstack check accept` denies writes under `deliverable_globs` (default `["content/", "briefs/", "campaigns/", "ledger/"]`, per-project) while the active plan declares zero criteria. Plans and `docs/` are never gated — you must always be able to write the criteria. Once criteria exist the gate allows, and the real enforcement moves to review: boxes are ticked by the **reviewer**, verifying each against the produced artifact — never by the building agent. A tick written by the building agent is treated like a forged `APPROVED:` line. An unverifiable criterion ("users are happier") is a review finding.

### Review

`hatstack review <hat> [--diff <ref>] [--files <glob>]`:

1. Resolve the rubric — `hats/<hat>/reviewer.md`.
2. Assemble the packet — approved plan, diff or named artifacts, success criteria.
3. Resolve the reviewer command from `reviewer_cmd` in config, else auto-detect in order: `claude -p`, `codex exec`, `gemini -p`.
4. Spawn it as a fresh process. The packet arrives on stdin; the building agent's context does not exist in that process.
5. Capture the report to `.hatstack/reviews/<date>-<hat>.md`.
6. Exit non-zero when the verdict is BLOCK.

No reviewer available → exit 3, report unavailable. Self-review is never a fallback; a review by the author is the thing this plugin exists to prevent.

Under Claude Code the same command is also reachable as a `Task` subagent, which gets nicer streaming. Both paths use the same rubric file, so behaviour does not fork.

Every rubric requires an **Inventory** section listing what was read, run, and checked. An approval without an inventory is a rejected review.

### Hats

A hat is a directory of markdown. The loop is domain-agnostic; the rubric *is* the hat.

| Hat | Plan | Build | Review |
|---|---|---|---|
| eng | `/eng-plan` | `/eng-build` | `/eng-review` |
| seo | `/seo-plan` | — | `/seo-review` |
| marketing | `/mkt-plan` | — | `/mkt-review` |
| accounting | `/acct-plan` | — | `/acct-review` |
| ceo | `/ceo-plan` | — | `/ceo-review` |

Namespaced prefixes so `/acct-review` and `/eng-review` never collide. Adding a hat is a directory plus a config entry.

### Media

`hatstack media image "<prompt>" [--provider fal|openrouter] [--model M] [--n N] [--out DIR]`
`hatstack media video "<prompt>" [--image <keyframe>]`

Keys from `FAL_KEY` / `OPENROUTER_API_KEY` only — never arguments, never written to the manifest. Every generation appends a JSONL entry (timestamp, provider, model, prompt, params, output filenames) so any asset traces back to the prompt that made it. OpenRouter serves images only; a video request against it is a clear error, not a silent fallback.

Provider payloads are per-model, not global: `fal-ai/flux/dev` takes `image_size`, not `aspect_ratio`. The sketch's `genmedia.mjs` folds into `lib/media.mjs` with that corrected and the payload builder unit-tested against recorded request shapes.

## Data flow

```
/eng-plan   -> three-approaches skill -> .hatstack/plans/<slug>.md, active-plan
            -> human picks -> APPROVED: line written
Write/Edit  -> adapter -> hatstack check plan  -> allow/deny
            -> adapter -> hatstack check tdd   -> allow/deny
hatstack test -- npm test -> .hatstack/state.json {red|green}
/eng-review -> hatstack review eng -> fresh process + rubric -> .hatstack/reviews/*.md
git commit  -> pre-commit -> hatstack check plan && check tdd -> pass/fail
```

## Configuration

`.hatstack/config.json`:

```json
{
  "hats": ["eng", "seo"],
  "plan_gate": "on",
  "tdd_gate": "on",
  "src_globs": ["src/", "app/", "lib/"],
  "deliverable_globs": ["content/", "briefs/", "campaigns/", "ledger/"],
  "test_command_pattern": "(vitest|pytest|cargo test)",
  "tdd_state_max_age_seconds": 1800,
  "refactor_window_seconds": 600,
  "reviewer_cmd": null,
  "media": { "provider": "fal", "image_model": "fal-ai/flux/dev" }
}
```

## Error handling

- **Gates fail closed.** A gate that silently disappears is worse than no gate, because you stop noticing it is gone. Unreadable state, malformed plan, or a crashing check all deny with the cause named.
- **Deny reasons are addressed to the agent** and say what to do next, not merely what is wrong. A deny that does not name the next action gets worked around.
- **Review unavailability is loud.** Exit 3 and an explicit message beat a review that quietly became self-review.
- **Media failures are per-item.** One failed generation in a batch of five reports that item and keeps the other four, with the failure recorded in the manifest.
- **Escape hatches are visible.** Every deny message names the switch that would turn the gate off, so disabling is a decision rather than a hunt.

## Testing

Written test-first with `node:test`. hatstack gates its own development.

- `plan.mjs` — approach counting, missing tradeoff blocks, the constrained-space form, `APPROVED:` detection, criteria extraction, malformed markdown.
- `state.mjs` — every transition including refactor-window expiry, stale RED, and clock boundaries. Time is injected, never read from the ambient clock inside the state machine.
- `gates.mjs` — exit code per scenario; path classification (test file, doc, source under and outside `src_globs`).
- `review.mjs` — dispatch with a fake reviewer executable: report captured, BLOCK maps to non-zero, no-CLI maps to exit 3.
- `media.mjs` — payload construction per provider and model with `fetch` stubbed. No live API calls in the suite.
- One integration test per adapter: the Claude hook wrapper emits valid decision JSON for allow and deny; the pre-commit hook fails a commit whose staged source has no RED on record.

## Build order

1. **Core** — CLI skeleton, `plan.mjs`, `state.mjs`, `gates.mjs`, config, `hatstack init`, `hatstack test`.
2. **Eng hat + Claude Code adapter** — commands, reviewer rubric, hooks, `review.mjs`. First end-to-end loop.
   Precondition: confirm the real non-interactive invocation of each reviewer CLI on this machine (`claude --help`, `codex --help`, `gemini --help`) and add one smoke test per detected CLI that pipes a trivial packet and asserts a non-empty response. The auto-detect list is a guess until that passes; `reviewer_cmd` absorbs whatever the true forms are.
3. **Adapters** — git pre-commit, `AGENTS.md`, `GEMINI.md`, `.cursorrules`. Portability stops being prose once a second harness runs the loop.
4. **Remaining hats** — seo, marketing, accounting, ceo. Rubrics only, cheap once 1–3 hold.
5. **Media** — `lib/media.mjs`, verified against a live key.

Each stage is independently useful and shippable.

## Open questions

- Whether Cursor/Windsurf can invoke `hatstack check` before a write at all, or only via pre-commit. Resolve empirically in stage 3; the design already assumes the pessimistic answer.
- Whether the eng reviewer should default to a different vendor than the builder (cross-model independence). Config supports it via `reviewer_cmd`; not the default until stage 2 shows whether same-vendor fresh-context reviews are already adversarial enough.

## Prior art

[superpowers](https://github.com/obra/superpowers) — the loop. [gstack](https://github.com/garrytan/gstack) — multi-role reviewers. [impeccable](https://github.com/pbakaus/impeccable) — rubric-driven quality passes.
