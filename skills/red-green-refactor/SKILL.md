---
name: red-green-refactor
description: Build source code test-first — write a failing test, make it pass with the minimum code, then refactor under green. Use when implementing any code change under an approved plan. The TDD gate enforces this: source writes under src_globs are denied until a failing test is on record. Triggers on "implement", "build", "write the code", "/eng-build", or editing source files.
---

# Red · Green · Refactor

Implementation that a test drove, not tests shaped to fit implementation. The failure mode this prevents: code lands first, then a test written afterwards that is bent to the code and cannot fail.

The TDD gate makes the cycle non-optional. Source writes under `src_globs` are denied unless a failing test is on record, and the RED state is never self-reported — it comes from the real exit code of a test run.

## Red — write the failing test first

Write one test for the **smallest** next behaviour the plan calls for. Not the whole feature — one behaviour. Then run it through hatstack so the state is recorded from the real exit code:

```bash
hatstack test -- <your test command>     # npm test, pytest, cargo test, node --test, …
```

Watch it fail. RED is now on record; source writes are unlocked. A test file is never gated — you can always write the test.

If the test passes the first time, it was not testing the new behaviour. Fix the test, not the code.

## Green — the minimum to pass

Write the least code that makes the test pass. Nothing the test does not demand — no speculative generality, no "while I'm here". Run the suite again through `hatstack test`. On green, a refactor window opens (default 600s) during which source stays writable.

## Refactor — under green only

Now clean up: rename, extract, dedupe, remove duplication between the test and the code — with the suite green the whole time. When the window closes, source locks again until the next failing test. That lock is the gate reminding you the next change needs its own test.

## Rules that keep the cycle honest

- **One behaviour per red.** If a failing test forces more than a few lines to pass, the step was too big — split it.
- **Never write implementation before the test.** The gate is the backstop, not the plan.
- **Do not weaken a test to make it pass.** A test you cannot make fail against a broken implementation is test theatre, and the reviewer will call it.
- **Stale RED does not count.** A red older than the max age (default 30 min) denies — yesterday's failure cannot authorise today's code. Re-run the suite.
- **Stay inside the approved plan.** Building what the plan did not authorise is plan drift — a review finding.

## Escape hatches, deliberately

`HATSTACK_TDD_OFF=1` for a shell, or `"tdd_gate": "off"` in `.hatstack/config.json` for the repo. Both are visible decisions, not reflexes. Every deny message names the switch so disabling is a choice, not a hunt.
