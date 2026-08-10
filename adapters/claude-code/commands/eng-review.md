---
description: Dispatch an independent engineering review of the current diff — never a self-review.
---

Dispatch the **eng-reviewer** subagent (via Task) to review the current diff against the approved plan. The reviewer runs in a fresh context and did not write this code — do not review your own work, and do not summarise the diff for it. It reads the artifacts itself.

The reviewer must return the rubric's report format, beginning with a `## Verdict` line and including an `## Inventory` of what it read, ran, and checked. An approval with no inventory is a rejected review.

If the Task subagent cannot be dispatched, fall back to the CLI, which runs the same rubric in a fresh process:

```bash
hatstack review eng --diff HEAD
```

Report the verdict and the path to the captured report under `.hatstack/reviews/`. On a BLOCK verdict, the work is not done — address the blockers and re-review. Never treat "looks good" without an inventory as a passing review.

$ARGUMENTS
