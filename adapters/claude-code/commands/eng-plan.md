---
description: Plan an engineering change as three genuinely distinct approaches, then stop for a human decision.
---

Use the **three-approaches** skill to plan this engineering work.

Interrogate the request first — what breaks today (a concrete instance), who is affected, what success looks like as a number, the non-negotiable constraint, what was already tried. Ask one or two at a time, in conversation.

Then write the plan to `.hatstack/plans/<slug>.md` and record its path in `.hatstack/active-plan`. The structure is load-bearing — the plan gate parses it:

- `## Problem`, `## Constraints`, `## Success criteria`
- Three `## Approach N` sections, each with **Pros**, **Cons**, **Reversibility**, **Cost** (all four are enforced). If only two genuine strategies exist, add a `## Constrained space` section naming the disqualified third and why.
- `## Recommendation`, `## Open questions`, and an empty `APPROVED:` line.

Then present the approaches with `AskUserQuestion` — one option per approach plus "none of these" — and **stop**. Do not create files or open a branch.

When the human picks, write `APPROVED: <approach name> — <date>` into the plan and continue to `/eng-build`. **Never write the APPROVED line yourself** — it is the human's signature, and the plan gate checks for it.

$ARGUMENTS
