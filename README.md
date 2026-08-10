# hatstack

Plan with three approaches → a human decides → build test-first → an agent that didn't write it tears it apart.

Same loop whether you're shipping code, a content brief, a campaign, a ledger, or a strategy memo. Enable only the hats you want per project.

Portable by design: Claude Code gets hard, pre-write gates; Codex, Gemini CLI, and Cursor run the identical loop with instruction files plus a git pre-commit backstop. **Zero runtime dependencies — Node ≥ 20 only.** No `jq`.

## Install

**Claude Code** (native plugin — the primary path):

```
/plugin marketplace add zakasalaheddine/hatstack
/plugin install hatstack@hatstack
```

**Any project** (git backstop + `.hatstack/`):

```bash
npx hatstack init
```

**Machine-wide** into every installed harness (Claude Code, Codex, Cursor, Gemini):

```bash
npx hatstack install            # symlinks; one rubric edit reaches every host
npx hatstack install --copy     # for hosts that don't follow symlinks
npx hatstack install --uninstall
```

Media generation requires `FAL_KEY` and/or `OPENROUTER_API_KEY`.

## Commands

Every hat namespaces its own, so `/acct-review` and `/eng-review` never collide:

| Hat | Plan | Build | Review |
|---|---|---|---|
| Engineering | `/eng-plan` | `/eng-build` | `/eng-review` |
| SEO | `/seo-plan` | — | `/seo-review` |
| Marketing & Ads | `/mkt-plan` | — | `/mkt-review` |
| Accounting | `/acct-plan` | — | `/acct-review` |
| Business strategy | `/ceo-plan` | — | `/ceo-review` |

Under the hood every command is the same CLI, reachable from any harness:

```bash
hatstack check <plan|tdd|accept> [--file PATH]   # a gate: exit 0 allow, 2 deny, 3 cannot-eval
hatstack test -- <command...>                    # run tests, record RED/GREEN from the real exit code
hatstack review <hat> [--diff REF] [--files G]   # dispatch an independent reviewer
hatstack media <image|video> "<prompt>" [...]    # generate assets with a provenance manifest
hatstack init                                    # scaffold .hatstack/ + git pre-commit hook
hatstack install [...]                           # link hats into installed harnesses
```

## The three gates

Prompt text erodes under context pressure. These are enforced instead — one gate implementation in `lib/`, translated per harness by a thin adapter that only maps an exit code.

**Plan gate** — once an active plan exists, nothing under `src_globs`/`deliverable_globs` gets written until `.hatstack/active-plan` points at a plan with ≥3 `## Approach N` blocks (or 2 plus an honest `## Constrained space` section), each carrying **Pros / Cons / Reversibility / Cost**, and a non-empty `APPROVED:` line. The agent is instructed never to write that line — it's your signature.

**TDD gate** — source edits under `src_globs` are denied unless a failing test is on record. RED isn't self-reported: `hatstack test` (and, on Claude Code, a `PostToolUse` hook) records red or green from the real exit code. A green run opens a refactor window; when it closes, source locks until the next failing test. RED older than the max age (default 30 min) is stale and denies. Test files, fixtures, docs, config and `.hatstack/` are never gated — you can always write the test.

**Acceptance gate** (non-code hats) — writes under `deliverable_globs` are denied while the active plan declares zero `## Success criteria`. Once criteria exist the gate allows, and real enforcement moves to review: the checkboxes are ticked by the **reviewer**, verifying each against the artifact — never by the building agent. A tick from the author is treated like a forged `APPROVED:`.

**Review separation** — the reviewer is a fresh process (or a Task subagent) that never saw the building agent's context. With no reviewer CLI available, `hatstack review` exits 3 and reports review *unavailable* rather than falling back to self-review. Every reviewer must publish an inventory of what it examined; "looks good" without one is a rejected review.

Escape hatches (`HATSTACK_TDD_OFF=1`, `tdd_gate`/`plan_gate`/`accept_gate` `off` in config) are deliberate rather than reflexive, and every deny message names the switch that turns the gate off. Gates fail **closed**: an unreadable state or malformed plan denies with the cause named, because a gate that silently disappears is worse than no gate.

## Portability

| Harness | Enforcement |
|---|---|
| Claude Code | Hard pre-write deny via `PreToolUse` hooks → `hatstack hook`. |
| Codex / Gemini / Cursor | Instruction file (`AGENTS.md` / `GEMINI.md` / `.cursorrules`) telling the agent to run `hatstack check` before writing. |
| Everything, including agents that ignore their instruction file | git `pre-commit` runs the same checks against the staged set. |

The asymmetry is stated, not hidden: where a harness has no pre-write deny primitive, enforcement degrades to instruction text plus the commit-time backstop. The same `hatstack check` invocation returns the same decision from a Claude hook, a git hook, or a bare shell.

## Per-project config

`.hatstack/config.json`:

```json
{
  "hats": ["eng", "seo"],
  "plan_gate": "on",
  "tdd_gate": "on",
  "accept_gate": "on",
  "src_globs": ["src/", "app/", "lib/"],
  "deliverable_globs": ["content/", "briefs/", "campaigns/", "ledger/"],
  "test_command_pattern": "(vitest|pytest|cargo test)",
  "tdd_state_max_age_seconds": 1800,
  "refactor_window_seconds": 600,
  "reviewer_cmd": null,
  "media": { "provider": "fal", "image_model": "fal-ai/flux/dev" }
}
```

`reviewer_cmd` overrides reviewer auto-detection (`claude -p` → `codex exec` → `gemini -p`) — useful to run reviews on a different vendor than the builder.

## Adding a hat

A hat is a directory of markdown under `hats/`: a `plan.md` and a `reviewer.md`. The loop is domain-agnostic — the rubric *is* the hat. Add the two files, a namespaced pair of Claude commands, and a config entry. The Claude reviewer agents are generated from the canonical `hats/<hat>/reviewer.md` and pinned to it by a drift test, so the CLI and Task review paths never fork.

## Layout

```
bin/hatstack.mjs                 CLI: check | test | review | media | init | install | hook
lib/                             plan, state, gates, review, media, config, hosts, init, hooks-claude
hats/{eng,seo,marketing,accounting,ceo}/   plan + reviewer rubrics
skills/{three-approaches,red-green-refactor,adversarial-review}/
adapters/
  claude-code/                   commands, agents, hooks (referenced by .claude-plugin/)
  codex/AGENTS.md  gemini/{GEMINI.md,gemini-extension.json}  cursor/.cursorrules
  git/pre-commit
test/                            node:test, mirrors lib/ — hatstack gates its own development
```

## Development

```bash
node --test
```

Written test-first with `node:test`; hatstack gates its own development. Prior art: [superpowers](https://github.com/obra/superpowers) (the loop, native per-harness manifests) and [gstack](https://github.com/garrytan/gstack) (multi-role reviewers, host auto-detection).

MIT.
