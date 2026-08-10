# /eng-build — build under the TDD gate

The plan is approved. Now build it test-first. The TDD gate will not let you write source under `src_globs` until a failing test is on record, so the loop is not optional — it is enforced.

Follow the **red-green-refactor** skill. The cycle:

## Red — write the failing test first

Write one test for the smallest next behaviour the plan calls for. Run it with your project's test command **through hatstack** so the state is recorded from the real exit code:

```bash
hatstack test -- npm test          # or: pytest, cargo test, node --test, …
```

Watch it fail. RED is now on record and source writes are unlocked. A test file is never gated — you can always write the test.

## Green — the minimum to pass

Write the least code that makes the test pass. Nothing the test does not demand. Run the suite again through `hatstack test`. On green, a refactor window opens (default 600s) during which source stays writable.

## Refactor — under green only

Clean up while the window is open: rename, extract, dedupe, with the suite green. When the window closes, source locks again until the next failing test. That is the gate reminding you the next change needs its own test.

## Rules

- One behaviour per red. If a test forces more than a few lines to pass, the step was too big.
- Never write the implementation before the test. The gate is the backstop, not the plan.
- Do not weaken a test to make it pass. A test you cannot make fail against a broken implementation is test theatre and the reviewer will call it.
- Stay inside the approved plan. Building something the plan did not authorise is plan drift — a review finding.

## When the feature is done

Run the full suite green, then hand off to `/eng-review`. The reviewer is a fresh process that never saw this session — do not review your own work.
