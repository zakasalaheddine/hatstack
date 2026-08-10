# /mkt-plan — marketing & ads plan

Plan a campaign as three genuinely distinct strategies, then stop for a human decision. Use the **three-approaches** skill.

## Interrogate first

- What are we actually trying to move — awareness, a specific conversion, retention? Name the one number.
- Who is the audience, and what do they believe right now that we need to change?
- What is the budget ceiling and the deadline? These disqualify approaches.
- What channels are off the table, and why (brand, legal, past failure)?
- What has been tried, and what did it cost per result?

## Write the plan

Write `.hatstack/plans/<slug>.md`, record its path in `.hatstack/active-plan`. Three `## Approach N` sections that differ in *strategy*, not in budget split — e.g. *paid-search capture of existing demand* vs *paid-social demand generation* vs *partnership/influencer borrow-audience*. Each needs **Pros**, **Cons**, **Reversibility**, **Cost**. Cost here is real spend plus creative production plus the opportunity cost of the channel.

The `## Success criteria` section gates the deliverables (the accept gate blocks writing campaign assets until it exists) and the reviewer verifies each:

```markdown
## Success criteria
- [ ] one primary metric with a target and a measurement window (e.g. CPA <= $40 over 14 days)
- [ ] a kill condition stated up front — what result stops the spend
- [ ] every asset maps to a stage of the funnel and a single call to action
```

Present the approaches to the human and stop. Write `APPROVED:` only when they answer.
