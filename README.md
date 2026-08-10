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

## Walkthrough

What using hatstack actually looks like, end to end. These are real interactions — the gate messages below are verbatim from the CLI.

### 1. Plan — `/eng-plan`

You start a hat, and instead of jumping to code the agent interrogates the request, then writes a decision document and **stops**.

```
You › /eng-plan add rate limiting to the public API

Claude › Before I sketch options — what breaks today without it? A concrete
         instance helps more than "abuse".

You › a single client hammered /search 40k times in a minute last week and
      pushed p99 latency to 9s for everyone.

Claude › Got it. Is a shared limit across all instances a hard requirement, or
         is per-instance acceptable for now? And what's the ceiling — requests
         per key per minute?

You › needs to be shared, we run 6 instances behind the LB. 600/min per key.

Claude › Written to .hatstack/plans/rate-limit-public-api.md with three
         approaches. Which do we build?
```

```
┌─ Which approach? ───────────────────────────────────────────────┐
│  1. Token bucket in-process    simple, but not shared; lost on   │
│                                restart                           │
│  2. Redis sliding window       shared across all 6 instances;    │
│                                adds a Redis dependency           │
│  3. API-gateway rule           no app code, but coarse — can't   │
│                                see the API key                   │
│  4. None of these                                                │
└──────────────────────────────────────────────────────────────────┘
```

```
You › 2

Claude › APPROVED: Approach 2: Redis sliding window — 2026-08-10 written into
         the plan. Ready for /eng-build.
```

The `APPROVED:` line is **your** signature — the agent is instructed never to write it on its own authority, and the plan gate checks for it. Until it's there, nothing under `src_globs` can be written:

```console
$ hatstack check plan
Plan gate: 'rate-limit-public-api.md' has 2 approaches; 3 are required. Give
each its own '## Approach N' section with Pros, Cons, Reversibility and Cost.
If only two genuine strategies exist, add a '## Constrained space' section
naming the disqualified third and why — do not pad with a fake option.
$ echo $?
2
```

### 2. Build — `/eng-build` (test-first, enforced)

Now the TDD gate takes over. Try to write the implementation first and it's denied — there's no failing test on record:

```console
$ hatstack check tdd --file src/ratelimit.js
TDD gate: no test run on record. Write a failing test for this change, run it
via `hatstack test -- <cmd>` (or your project's test command), and watch it
fail. Disable deliberately with tdd_gate:"off" in .hatstack/config.json or
HATSTACK_TDD_OFF=1. (file: src/ratelimit.js)
$ echo $?
2
```

So you write the test first and run it through hatstack, which records RED from the **real exit code** — not a self-report:

```console
$ hatstack test -- npm test
 FAIL  test/ratelimit.test.js
  ✗ blocks the 601st request in a 60s window

hatstack: RED recorded (.hatstack/state.json). Source writes are now allowed —
implement the minimum to pass.
```

RED unlocks source. Now the gate allows the implementation:

```console
$ hatstack check tdd --file src/ratelimit.js
RED on record — implement the minimum to pass.
$ echo $?
0
```

Make it pass, run again, and green opens a refactor window — after which source locks until the next failing test:

```console
$ hatstack test -- npm test
 PASS  test/ratelimit.test.js  (12 passing)

hatstack: GREEN recorded (.hatstack/state.json). Refactor window open for 600s;
then source writes lock until the next failing test.
```

On Claude Code this is fully automatic — a `PostToolUse` hook records RED/GREEN whenever you run your test command, and the `PreToolUse` hook enforces the gate before every Write/Edit. You never call `hatstack test` by hand.

### 3. Review — `/eng-review` (a different agent)

The reviewer runs in a **fresh process** that never saw the building session, applies `hats/eng/reviewer.md`, and writes a report:

```
You › /eng-review

Claude › Dispatching eng-reviewer (fresh context) against HEAD…

  ## Verdict
  APPROVE WITH FINDINGS

  ## Inventory
  Read the approved plan, the full diff (src/ratelimit.js, test/ratelimit.test.js),
  ran the suite (12 passing). Checked: window boundary, Redis eviction, the
  601st-request edge, concurrent callers on one key.

  ## Findings
  ### [MAJOR] Window key never expires
  Location: src/ratelimit.js:24
  Consequence: every API key leaves a Redis key that outlives its window; memory
  grows without bound. Suggested direction: set a TTL on the window key.
  ### [NIT] 429 body has no Retry-After header

  Report → .hatstack/reviews/2026-08-10-eng.md
```

If no reviewer CLI is available it fails loud rather than quietly reviewing itself:

```console
$ hatstack review eng --diff HEAD
hatstack review: no reviewer CLI found (looked for claude, codex, gemini).
Install one or set reviewer_cmd in .hatstack/config.json. Review is
UNAVAILABLE — it never falls back to self-review.
$ echo $?
3
```

### Non-code hats — same loop, no test runner

For SEO, marketing, accounting, and strategy the acceptance gate replaces the TDD gate. A deliverable can't be written until the plan declares observable success criteria — and those checkboxes are ticked by the **reviewer**, never by the agent that wrote the work:

```console
$ hatstack check accept --file briefs/q3.md
Accept gate: 'q3-content-plan.md' declares zero success criteria. Add a
'## Success criteria' section with at least one '- [ ]' checkbox before writing
'briefs/q3.md'. The reviewer ticks the boxes, never the building agent.
$ echo $?
2
```

```
You › /acct-plan how should we treat the new SaaS subscription — capitalise or expense?

Claude › Which standard governs this, and is there a bright line or genuine
         judgement? … [three approaches: capitalise & amortise / expense as
         incurred / defer pending more info] Which treatment?

You › expense as incurred

Claude › APPROVED written. /acct-review will re-perform the arithmetic and tie
         every entry to source before ticking your success criteria — I won't
         tick them myself.
```

### From Codex, Gemini, or a bare shell

There are no slash commands outside Claude Code, but the loop is identical — the agent runs `hatstack check` before writing (per `AGENTS.md` / `GEMINI.md` / `.cursorrules`), and the git `pre-commit` hook enforces the same decision at commit time even if the agent skips the check:

```console
$ git commit -m "add rate limiter"
hatstack: TDD gate blocked 'src/ratelimit.js':
TDD gate: no test run on record. Write a failing test for this change…

hatstack: commit blocked. Fix the above, or disable a gate deliberately in
.hatstack/config.json.
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
