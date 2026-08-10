---
name: three-approaches
description: Produce a decision document offering at least three genuinely distinct approaches with pros, cons, reversibility and cost, then stop and ask the human to choose. Use before any implementation, migration, campaign, filing, or content plan — whenever the work is about to become expensive to undo. Triggers on "plan", "how should I", "what's the best way", "should we", or any hat's plan command.
---

# Three Approaches

Planning output that a human can actually decide on. The failure mode this exists to prevent is the agent picking an approach in its own head, then writing a plan that argues for it — the alternatives present as strawmen and the human rubber-stamps.

## The rule

**Three approaches minimum, and they must be genuinely different.** Different in *strategy*, not in parameters. `Postgres` vs `Postgres with a different index` is one approach. `Postgres` vs `SQLite embedded` vs `don't persist, recompute on read` is three.

If the space really is constrained — two options and the third is a stretch — say so in the plan explicitly and explain why. An honest "there are only two viable paths here, and here's the disqualified third" is acceptable. Padding with a fake option is not.

## Before writing anything

Interrogate the request. You are looking for the problem behind the ask:

1. What breaks today if we do nothing? Get a concrete instance, not a category.
2. Who is affected, and how do they work around it now?
3. What does success look like in a number?
4. What constraint is non-negotiable — budget, deadline, a system that can't change, a legal requirement?
5. What has already been tried?

Ask these one or two at a time in conversation. Do not dump five questions and wait.

## Plan artifact

Write to `.hatstack/plans/<slug>.md` and record the path in `.hatstack/active-plan`. The plan gate parses this file, so the structure is load-bearing:

```markdown
# <Title>
Hat: <eng|seo|marketing|accounting|ceo>
Date: <YYYY-MM-DD>

## Problem
What actually breaks, in one paragraph, with a concrete instance.

## Constraints
Hard constraints only. Things that disqualify an approach.

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

The `APPROVED:` line stays empty until the human answers.

## The gate

After writing the plan, **present the approaches and stop.** Use `AskUserQuestion` with one option per approach plus "none of these". Do not begin work, do not create files, do not open a branch.

When the human answers, write `APPROVED: <approach name> — <date>` into the plan and proceed. If they pick "none of these", go back to the interrogation — you misread the problem, not the options.

**Never write the APPROVED line on your own authority.** The plan gate checks for it precisely because it is the human's signature. Forging it defeats the entire plugin.

## Reversibility is the tiebreaker

When two approaches score similarly, prefer the one that is cheaper to undo. Most decisions are made with bad information; the value of a reversible choice is that it converts a bet into an experiment. Say this out loud in the recommendation when it applies.
