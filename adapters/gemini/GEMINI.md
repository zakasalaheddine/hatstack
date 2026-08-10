# hatstack loop (Gemini CLI)

This project runs the hatstack loop: **plan with three approaches → a human approves → build test-first → an independent agent reviews.** Gemini CLI has no pre-write deny primitive, so enforcement here is this instruction file plus a git pre-commit backstop that runs the same checks. Treat it as binding.

## Before you write, run the gate and obey a non-zero exit

```bash
hatstack check plan                 # 3 approved approaches required before any build write
hatstack check tdd  --file <path>   # source writes need a failing test on record
hatstack check accept --file <path> # deliverables need success criteria in the plan
```

Exit `0` allow, `2` deny (reason on stdout), `3` cannot evaluate (deny).

## Plan

Write `.hatstack/plans/<slug>.md` with three genuinely distinct `## Approach N` sections, each carrying **Pros**, **Cons**, **Reversibility**, and **Cost**; record the path in `.hatstack/active-plan`; present the options to the human and stop. Never write `APPROVED:` yourself.

## Build

```bash
hatstack test -- <your test command>
```

Failing test first (RED), minimum code to pass (GREEN), refactor under green. No implementation before a test.

## Review

```bash
hatstack review eng --diff HEAD
```

A fresh reviewer process, never your own context. BLOCK means not done.
