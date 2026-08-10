---
description: Build the approved plan test-first under the TDD gate — red, green, refactor.
---

The plan is approved. Build it with the **red-green-refactor** skill. The TDD gate blocks source writes under `src_globs` until a failing test is on record, so the loop is enforced, not optional.

1. **Red** — write one failing test for the smallest next behaviour, then run it through hatstack so the state is recorded from the real exit code:

   ```bash
   hatstack test -- <your test command>
   ```

   Watch it fail. RED unlocks source writes. Test files are never gated.

2. **Green** — write the minimum to pass. Run `hatstack test` again. On green, a refactor window opens.

3. **Refactor** — clean up while the window is open and the suite is green. When it closes, source locks until the next failing test.

Stay inside the approved plan — building what the plan did not authorise is plan drift. Do not weaken a test to make it pass. When the feature is done and green, hand off to `/eng-review`.

$ARGUMENTS
