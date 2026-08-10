import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkPlan, checkTdd, checkAccept, isTddExempt, isUnderGlobs } from "../lib/gates.mjs";
import { buildState } from "../lib/state.mjs";

function tmpRoot() {
  const root = mkdtempSync(join(tmpdir(), "hatstack-gate-"));
  mkdirSync(join(root, ".hatstack", "plans"), { recursive: true });
  return root;
}
function setPlan(root, name, body) {
  writeFileSync(join(root, ".hatstack", "plans", name), body);
  writeFileSync(join(root, ".hatstack", "active-plan"), `.hatstack/plans/${name}`);
}

const APPROVED_PLAN = `# T
## Success criteria
- [ ] one measurable thing
## Approach 1: A
**Pros:** a
**Cons:** b
**Reversibility:** c
**Cost:** d
## Approach 2: B
**Pros:** a
**Cons:** b
**Reversibility:** c
**Cost:** d
## Approach 3: C
**Pros:** a
**Cons:** b
**Reversibility:** c
**Cost:** d
APPROVED: A — 2026-08-10
`;

test("path classification", () => {
  assert.equal(isTddExempt("src/foo.test.js"), true);
  assert.equal(isTddExempt("docs/x.md"), true);
  assert.equal(isTddExempt("config.json"), true);
  assert.equal(isTddExempt("src/foo.js"), false);
  assert.equal(isUnderGlobs("src/foo.js", ["src/", "app/"]), true);
  assert.equal(isUnderGlobs("scripts/foo.js", ["src/"]), false);
  assert.equal(isUnderGlobs("packages/x/src/a.js", ["src/"]), true);
});

test("plan gate: inert with no active plan", () => {
  const root = tmpRoot();
  assert.equal(checkPlan({ root, config: {} }).exitCode, 0);
  rmSync(root, { recursive: true, force: true });
});

test("plan gate: denies a 2-approach plan", () => {
  const root = tmpRoot();
  const two = APPROVED_PLAN.replace(/## Approach 3[\s\S]*?Cost:\*\* d\n/, "");
  setPlan(root, "p.md", two);
  const r = checkPlan({ root, config: {} });
  assert.equal(r.exitCode, 2);
  assert.match(r.reason, /3 are required/);
  rmSync(root, { recursive: true, force: true });
});

test("plan gate: denies a missing Cons block", () => {
  const root = tmpRoot();
  setPlan(root, "p.md", APPROVED_PLAN.replace("**Cons:** b\n**Reversibility:** c\n**Cost:** d\n## Approach 3", "**Reversibility:** c\n**Cost:** d\n## Approach 3"));
  const r = checkPlan({ root, config: {} });
  assert.equal(r.exitCode, 2);
  assert.match(r.reason, /missing Cons/);
  rmSync(root, { recursive: true, force: true });
});

test("plan gate: denies with no APPROVED line", () => {
  const root = tmpRoot();
  setPlan(root, "p.md", APPROVED_PLAN.replace(/APPROVED:.*/, "APPROVED:"));
  const r = checkPlan({ root, config: {} });
  assert.equal(r.exitCode, 2);
  assert.match(r.reason, /APPROVED/);
  rmSync(root, { recursive: true, force: true });
});

test("plan gate: allows a well-formed approved plan", () => {
  const root = tmpRoot();
  setPlan(root, "p.md", APPROVED_PLAN);
  assert.equal(checkPlan({ root, config: {} }).exitCode, 0);
  rmSync(root, { recursive: true, force: true });
});

test("plan gate: constrained space stands in for the third approach", () => {
  const root = tmpRoot();
  const two = APPROVED_PLAN.replace(
    /## Approach 3[\s\S]*?Cost:\*\* d\n/,
    "## Constrained space\nOnly two viable strategies; the third is disqualified by latency.\n"
  );
  setPlan(root, "p.md", two);
  assert.equal(checkPlan({ root, config: {} }).exitCode, 0);
  rmSync(root, { recursive: true, force: true });
});

test("plan gate: missing plan file cannot-evaluate (exit 3)", () => {
  const root = tmpRoot();
  writeFileSync(join(root, ".hatstack", "active-plan"), ".hatstack/plans/gone.md");
  assert.equal(checkPlan({ root, config: {} }).exitCode, 3);
  rmSync(root, { recursive: true, force: true });
});

test("tdd gate: source write denied with no state", () => {
  const root = tmpRoot();
  const r = checkTdd({ root, config: { src_globs: ["src/"] }, file: "src/a.js", now: 100 });
  assert.equal(r.exitCode, 2);
  rmSync(root, { recursive: true, force: true });
});

test("tdd gate: test file always writable", () => {
  const root = tmpRoot();
  const r = checkTdd({ root, config: { src_globs: ["src/"] }, file: "src/a.test.js", now: 100 });
  assert.equal(r.exitCode, 0);
  rmSync(root, { recursive: true, force: true });
});

test("tdd gate: green-then-edit allowed, 11 min later denied", () => {
  const root = tmpRoot();
  const cfg = { src_globs: ["src/"], refactor_window_seconds: 600 };
  writeFileSync(join(root, ".hatstack", "state.json"), JSON.stringify(buildState({ status: "green", now: 1000, config: cfg })));
  assert.equal(checkTdd({ root, config: cfg, file: "src/a.js", now: 1000 }).exitCode, 0);
  assert.equal(checkTdd({ root, config: cfg, file: "src/a.js", now: 1000 + 660 }).exitCode, 2);
  rmSync(root, { recursive: true, force: true });
});

test("tdd gate: off via config allows anything", () => {
  const root = tmpRoot();
  const r = checkTdd({ root, config: { tdd_gate: "off", src_globs: ["src/"] }, file: "src/a.js", now: 100 });
  assert.equal(r.exitCode, 0);
  rmSync(root, { recursive: true, force: true });
});

test("accept gate: deliverable denied under a plan with no criteria", () => {
  const root = tmpRoot();
  const noCriteria = APPROVED_PLAN.replace("## Success criteria\n- [ ] one measurable thing\n", "");
  setPlan(root, "p.md", noCriteria);
  const r = checkAccept({ root, config: { deliverable_globs: ["briefs/"] }, file: "briefs/x.md" });
  assert.equal(r.exitCode, 2);
  rmSync(root, { recursive: true, force: true });
});

test("accept gate: allows once one criterion exists", () => {
  const root = tmpRoot();
  setPlan(root, "p.md", APPROVED_PLAN);
  const r = checkAccept({ root, config: { deliverable_globs: ["briefs/"] }, file: "briefs/x.md" });
  assert.equal(r.exitCode, 0);
  rmSync(root, { recursive: true, force: true });
});

test("accept gate: non-deliverable path is never gated", () => {
  const root = tmpRoot();
  const r = checkAccept({ root, config: { deliverable_globs: ["briefs/"] }, file: "notes.md" });
  assert.equal(r.exitCode, 0);
  rmSync(root, { recursive: true, force: true });
});
