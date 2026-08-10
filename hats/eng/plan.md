# /eng-plan — engineering plan

Produce a decision document with at least three genuinely distinct approaches, then stop and let the human choose. Do not begin implementation.

Follow the **three-approaches** skill. In short:

## Interrogate the request first

You are looking for the problem behind the ask. Ask one or two at a time, in conversation — do not dump five questions and wait:

1. What breaks today if we do nothing? A concrete instance, not a category.
2. Who is affected, and how do they work around it now?
3. What does success look like as a number?
4. What constraint is non-negotiable — budget, deadline, a system that can't change, a legal requirement?
5. What has already been tried?

## Write the plan

Write to `.hatstack/plans/<slug>.md` and record the path in `.hatstack/active-plan`. The plan gate parses this file, so the structure is load-bearing:

```markdown
# <Title>
Hat: eng
Date: <YYYY-MM-DD>

## Problem
What actually breaks, in one paragraph, with a concrete instance.

## Constraints
Hard constraints only — things that disqualify an approach.

## Success criteria
Observable and measurable. "Users are happier" is not a criterion.

## Approach 1: <name>
One paragraph on what this is and why it's on the table.
**Pros:** ...
**Cons:** ...
**Reversibility:** How hard is it to walk this back in three months?
**Cost:** Time, money, and ongoing maintenance burden.

## Approach 2: <name>
...

## Approach 3: <name>
...

## Recommendation
Name one and defend it in three sentences. State what would change your mind.

## Open questions
Things you could not resolve. Do not silently guess.

APPROVED:
```

Every approach needs **Pros**, **Cons**, **Reversibility**, and **Cost** — the gate enforces all four. If only two genuine strategies exist, add a `## Constrained space` section naming the disqualified third and why; the gate accepts that in place of the third approach. Padding with a fake option is the failure this prevents.

## Then stop

Present the approaches with the harness's question primitive (Claude `AskUserQuestion`) — one option per approach plus "none of these" — and **stop.** Do not create files, open a branch, or begin work.

When the human answers, write `APPROVED: <approach name> — <date>` into the plan and proceed to `/eng-build`. **Never write the APPROVED line on your own authority** — the plan gate checks for it precisely because it is the human's signature.
