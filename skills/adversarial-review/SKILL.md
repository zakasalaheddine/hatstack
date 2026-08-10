---
name: adversarial-review
description: Review completed work with a fresh agent that did not produce it, applying a domain rubric and publishing an inventory of what was examined. Use after a build or deliverable is done, before it ships. The reviewer is a separate process — self-review is never a fallback. Triggers on "review", "check my work", "is this ready", or any hat's review command.
---

# Adversarial Review

The reviewer is a different agent, in a fresh context, that did not write the thing it reviews. The failure mode this prevents: the author reviews their own intent instead of their output, and the blind spot that produced the bug also hides it.

## The two rules that make it real

**A fresh process, never the author.** Run `hatstack review <hat>` (or dispatch the hat's reviewer subagent via Task). The rubric, the approved plan, and the diff or artifacts arrive on the reviewer's stdin; the building agent's context does not exist in that process. If no reviewer is available, the command exits 3 and reports review **unavailable** — it never quietly falls back to self-review. A review by the author is the thing this loop exists to prevent.

**An inventory or it didn't happen.** Every rubric requires an `## Inventory` section: what was read, what was run, and what was specifically checked. "Looks good" with no inventory is a rejected review. An approval has to show its work.

## What a review produces

```
## Verdict
BLOCK | APPROVE WITH FINDINGS | APPROVE

## Inventory
What I read, what I ran, what I checked for. Required.

## Findings
### [BLOCKER] <title>
Consequence, evidence, and a one-sentence direction — not the fix.
### [MAJOR] / [MINOR] / [NIT] ...

## Not verified
What I could not check, and why.
```

The report is captured to `.hatstack/reviews/<date>-<hat>.md`. A **BLOCK** verdict exits non-zero: the work is not done until the blockers are addressed and it is re-reviewed.

## For non-code hats: the reviewer ticks the boxes

The plan's `## Success criteria` checkboxes are ticked by the **reviewer**, verifying each against the produced artifact — never by the building agent. A tick written by the author is treated like a forged `APPROVED:` line. An unverifiable criterion ("users are happier") is a finding, not a tick.

## Rank honestly

Inflating a NIT to a BLOCKER trains the team to ignore your severities, and then the real blocker gets ignored too. A review that finds nothing on real work is either trivial work or a failed review — and the reviewer should say which. Label anything inferred rather than confirmed as speculation.
