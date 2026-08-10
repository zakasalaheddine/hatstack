---
description: Dispatch an independent SEO review of the deliverable — never a self-review.
---

Dispatch the **seo-reviewer** subagent (via Task) to review the SEO deliverable against the approved plan. It runs in a fresh context and did not produce this work — do not review your own output and do not summarise it for the reviewer; it reads the artifacts itself.

The reviewer must return the rubric format: a `## Verdict` line, an `## Inventory` of what it read and verified, a `## Criteria` block ticking each success criterion with evidence, and ranked findings. An approval with no inventory is a rejected review.

If the Task subagent cannot be dispatched, fall back to the CLI, which runs the same rubric in a fresh process:

```bash
hatstack review seo --files "<glob of the deliverable>"
```

Report the verdict and the captured report path under `.hatstack/reviews/`. A BLOCK verdict means the work is not done.

$ARGUMENTS
