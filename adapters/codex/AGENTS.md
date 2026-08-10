# hatstack loop (Codex)

This project runs the hatstack loop: **plan with three approaches → a human approves → build test-first → an independent agent reviews.** Codex has no pre-write deny primitive, so here enforcement is instruction plus a git pre-commit backstop that runs the same checks. Honour it as if it were hard.

## Before you write

Run the gate yourself and obey a non-zero exit:

```bash
hatstack check plan                 # blocks until the active plan has 3 approved approaches
hatstack check tdd  --file <path>   # blocks source writes with no failing test on record
hatstack check accept --file <path> # blocks deliverables under a plan with no success criteria
```

Exit `0` allow, `2` deny (reason on stdout — do what it says), `3` cannot evaluate (treat as deny).

## Plan

Do not pick an approach in your head and argue for it. Write `.hatstack/plans/<slug>.md` with three genuinely distinct `## Approach N` sections — each with **Pros**, **Cons**, **Reversibility**, **Cost** — record its path in `.hatstack/active-plan`, present the options to the human, and stop. Never write the `APPROVED:` line yourself; it is the human's signature.

## Build

Write the failing test first, then run it so the state is recorded:

```bash
hatstack test -- <your test command>
```

RED unlocks source writes. Write the minimum to pass, re-run, refactor under green. Do not write implementation before a test exists.

## Review

```bash
hatstack review eng --diff HEAD
```

The reviewer is a fresh process that never saw your context. Do not review your own work. A BLOCK verdict means the work is not done.
