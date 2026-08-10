# hatstack

Plan with three approaches → human decides → build test-first → an agent that didn't write it tears it apart.

Same loop whether you're shipping code, a content brief, a campaign, a ledger, or a strategy memo. Install only the hats you want per project.

## Install

```bash
/plugin marketplace add <you>/hatstack
/plugin install hatstack-core@hatstack     # required
/plugin install hatstack-eng@hatstack
/plugin install hatstack-seo@hatstack
/plugin install hatstack-marketing@hatstack
/plugin install hatstack-accounting@hatstack
/plugin install hatstack-ceo@hatstack
/plugin install hatstack-media@hatstack
```

Requires `jq`. Media generation requires `FAL_KEY` and/or `OPENROUTER_API_KEY`.

## Commands

Every hat namespaces its own, so `/acct-review` and `/eng-review` never collide:

| Hat | Plan | Build | Review |
|---|---|---|---|
| Engineering | `/eng-plan` | `/eng-build` | `/eng-review` |
| SEO | `/seo-plan` | — | `/seo-review` |
| Marketing & Ads | `/mkt-plan` | — | `/mkt-review` |
| Accounting | `/acct-plan` | — | `/acct-review` |
| Business strategy | `/ceo-plan` | — | `/ceo-review` |

## The three gates

Everything else in this repo is prompt text, and prompt text erodes under context pressure. These three are hooks, so they hold whether or not the agent remembers to care.

**Plan gate** (`PreToolUse` on Write/Edit) — once a hat session is open, nothing gets written until `.hatstack/active-plan` points at a plan with ≥3 `## Approach N` blocks, each carrying Pros / Cons / Reversibility, and an `APPROVED:` line. The agent is instructed never to write that line itself; it's your signature.

**TDD gate** (`PreToolUse` on Write/Edit) — source edits are denied unless a failing test is on record. The RED state isn't self-reported: a `PostToolUse` hook on Bash watches for test-runner invocations and records red or green from the actual exit code. RED expires after 30 minutes so yesterday's failure can't authorise today's code. Test files, fixtures, docs and config are never gated — you must always be able to write the test.

**Review separation** — the reviewer is a real subagent with a fresh context, dispatched via Task. If it can't be dispatched, the command reports review as unavailable rather than falling back to self-review. Every reviewer must publish an inventory of what it examined; "looks good" without one is a rejected review.

Escape hatches exist (`HATSTACK_TDD_OFF=1`, `.hatstack/config.json`) and are deliberate rather than reflexive. The gates fail *closed* if `jq` is missing — a gate that silently disappears is worse than no gate, because you stop noticing it isn't there.

## Per-project config

`.hatstack/config.json`:

```json
{
  "tdd_gate": "on",
  "src_globs": ["src/", "app/", "lib/"],
  "test_command_pattern": "(vitest|pytest|cargo test)",
  "tdd_state_max_age_seconds": 1800
}
```

## Adding a hat

Copy any hat plugin, rename the command prefix, and rewrite `agents/<x>-reviewer.md`. The rubric *is* the hat — the loop is already domain-agnostic. Register it in `.claude-plugin/marketplace.json`.

## Layout

```
.claude-plugin/marketplace.json
plugins/
  hatstack-core/          hooks + three-approaches, red-green-refactor, adversarial-review
  hatstack-{eng,seo,marketing,accounting,ceo}/   commands + reviewer agent
  hatstack-media/         fal / OpenRouter generation with a provenance manifest
```

Prior art: [superpowers](https://github.com/obra/superpowers) (the loop), [gstack](https://github.com/garrytan/gstack) (multi-role reviewers).

MIT.
