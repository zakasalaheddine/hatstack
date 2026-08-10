# /acct-plan — accounting plan

Plan an accounting treatment, close process, or financial deliverable as three genuinely distinct approaches, then stop for a human decision. Use the **three-approaches** skill. This hat is conservative by design: when two approaches are close, prefer the one that is easier to unwind and easier to audit.

## Interrogate first

- What transaction, balance, or process is in question? A concrete instance with amounts.
- What standard governs it (GAAP/IFRS section, tax code), and is there genuine judgement or a bright line?
- What does "correct" look like — a reconciled balance, a defensible position, a clean audit trail?
- What is fixed — the accounting system, the fiscal calendar, a covenant, a filing deadline?
- What was the prior treatment, and would changing it require a restatement or disclosure?

## Write the plan

Write `.hatstack/plans/<slug>.md`, record its path in `.hatstack/active-plan`. Three `## Approach N` sections — e.g. *capitalise and amortise* vs *expense as incurred* vs *defer pending more information* — each with **Pros**, **Cons**, **Reversibility**, **Cost**. Reversibility is the tiebreaker: a treatment that forces a restatement to undo is a heavy con.

The `## Success criteria` section gates the deliverables (ledger entries, schedules, memos) and the reviewer verifies each:

```markdown
## Success criteria
- [ ] every entry cites the governing standard and ties to source documents
- [ ] the schedule reconciles to the trial balance to the cent
- [ ] the position is defensible in an audit and its disclosure requirement is stated
```

Present the approaches to the human and stop. Write `APPROVED:` only when they answer — never on your own authority.
