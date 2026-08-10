import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlan } from "../lib/plan.mjs";

const wellFormed = `# Title
Hat: eng
Date: 2026-08-10

## Problem
Something breaks.

## Success criteria
- [ ] first thing measurable
- [x] second thing done

## Approach 1: A
What it is.
**Pros:** fast
**Cons:** risky
**Reversibility:** easy
**Cost:** low

## Approach 2: B
What it is.
**Pros:** cheap
**Cons:** slow
**Reversibility:** medium
**Cost:** medium

## Approach 3: C
What it is.
**Pros:** safe
**Cons:** expensive
**Reversibility:** hard
**Cost:** high

## Recommendation
Pick A.

APPROVED: Approach 1: A — 2026-08-10
`;

test("counts three well-formed approaches", () => {
  const p = parsePlan(wellFormed);
  assert.equal(p.approachCount, 3);
  assert.equal(p.approaches.every((a) => a.missing.length === 0), true);
});

test("extracts approval signature", () => {
  const p = parsePlan(wellFormed);
  assert.equal(p.approved, "Approach 1: A — 2026-08-10");
});

test("bare APPROVED with no text is not approved", () => {
  const p = parsePlan(wellFormed.replace(/APPROVED:.*/, "APPROVED:"));
  assert.equal(p.approved, null);
});

test("detects a missing Cons block", () => {
  const md = wellFormed.replace("**Cons:** risky\n", "");
  const p = parsePlan(md);
  const a1 = p.approaches.find((a) => /Approach 1/.test(a.name));
  assert.deepEqual(a1.missing, ["Cons"]);
});

test("detects a missing Cost block (enforced, unlike the sketch)", () => {
  const md = wellFormed.replace("**Cost:** high\n", "");
  const p = parsePlan(md);
  const a3 = p.approaches.find((a) => /Approach 3/.test(a.name));
  assert.deepEqual(a3.missing, ["Cost"]);
});

test("recognises the constrained-space section", () => {
  const md = `# T
## Approach 1: A
**Pros:** x
**Cons:** y
**Reversibility:** z
**Cost:** w
## Approach 2: B
**Pros:** x
**Cons:** y
**Reversibility:** z
**Cost:** w
## Constrained space
Only two real strategies; the third would be recompute-on-read, disqualified because latency budget is 5ms.
APPROVED: B — 2026-08-10
`;
  const p = parsePlan(md);
  assert.equal(p.approachCount, 2);
  assert.equal(p.hasConstrainedSpace, true);
});

test("extracts success criteria with checked state", () => {
  const p = parsePlan(wellFormed);
  assert.equal(p.hasSuccessSection, true);
  assert.equal(p.criteria.length, 2);
  assert.equal(p.criteria[0].checked, false);
  assert.equal(p.criteria[1].checked, true);
  assert.equal(p.criteria[0].text, "first thing measurable");
});

test("handles heading-style tradeoff labels", () => {
  const md = `# T
## Approach 1: A
### Pros
good
### Cons
bad
### Reversibility
easy
### Cost
cheap
`;
  const p = parsePlan(md);
  assert.deepEqual(p.approaches[0].missing, []);
});

test("empty / malformed input does not throw", () => {
  assert.doesNotThrow(() => parsePlan(""));
  assert.doesNotThrow(() => parsePlan(null));
  assert.doesNotThrow(() => parsePlan("###### not a plan"));
  assert.equal(parsePlan("").approachCount, 0);
});
