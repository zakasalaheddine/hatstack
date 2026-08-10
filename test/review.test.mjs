import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectReviewer, parseVerdict, assemblePacket, runReview } from "../lib/review.mjs";

// A fake reviewer: reads the packet on stdin, echoes a report with the verdict
// passed as argv. Exercises the real spawn path — no mocking of child_process.
function fakeReviewer(root, verdict) {
  const p = join(root, "fake-reviewer.mjs");
  writeFileSync(
    p,
    `let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{` +
      `process.stdout.write("## Verdict\\n${verdict}\\n\\n## Inventory\\nread packet of "+s.length+" bytes\\n");});`
  );
  return `node ${p}`;
}

test("parseVerdict reads the verdict line", () => {
  assert.equal(parseVerdict("## Verdict\nBLOCK\n"), "BLOCK");
  assert.equal(parseVerdict("## Verdict\nAPPROVE WITH FINDINGS\n"), "APPROVE WITH FINDINGS");
  assert.equal(parseVerdict("## Verdict\nAPPROVE\n"), "APPROVE");
  assert.equal(parseVerdict("garbage"), "UNKNOWN");
});

test("detectReviewer honours reviewer_cmd string and array", () => {
  assert.deepEqual(detectReviewer({ reviewer_cmd: "claude -p" }), ["claude", "-p"]);
  assert.deepEqual(detectReviewer({ reviewer_cmd: ["codex", "exec"] }), ["codex", "exec"]);
});

test("detectReviewer returns null when nothing is on PATH", () => {
  assert.equal(detectReviewer({}, { has: () => false }), null);
});

test("detectReviewer prefers claude, then codex, then gemini", () => {
  assert.deepEqual(detectReviewer({}, { has: (b) => b === "gemini" }), ["gemini", "-p"]);
  assert.deepEqual(detectReviewer({}, { has: (b) => b !== "claude" }), ["codex", "exec"]);
});

test("assemblePacket includes rubric, plan, and diff", () => {
  const p = assemblePacket({ rubric: "RUBRIC", planText: "PLAN", diff: "DIFF" });
  assert.match(p, /RUBRIC/);
  assert.match(p, /PLAN/);
  assert.match(p, /DIFF/);
});

test("runReview: BLOCK verdict maps to non-zero and captures the report", () => {
  const root = mkdtempSync(join(tmpdir(), "hs-rev-"));
  const res = runReview({ hat: "eng", root, config: { reviewer_cmd: fakeReviewer(root, "BLOCK") } });
  assert.equal(res.exitCode, 1);
  assert.equal(res.verdict, "BLOCK");
  assert.ok(existsSync(res.reportPath));
  assert.match(readFileSync(res.reportPath, "utf8"), /read packet of \d+ bytes/);
  rmSync(root, { recursive: true, force: true });
});

test("runReview: APPROVE verdict maps to zero", () => {
  const root = mkdtempSync(join(tmpdir(), "hs-rev-"));
  const res = runReview({ hat: "eng", root, config: { reviewer_cmd: fakeReviewer(root, "APPROVE") } });
  assert.equal(res.exitCode, 0);
  assert.equal(res.verdict, "APPROVE");
  rmSync(root, { recursive: true, force: true });
});

test("runReview: no reviewer available exits 3 and never self-reviews", () => {
  const root = mkdtempSync(join(tmpdir(), "hs-rev-"));
  // Force detection to find nothing by injecting an empty detect.
  const res = runReview({ hat: "eng", root, config: {}, detect: () => null });
  assert.equal(res.exitCode, 3);
  assert.match(res.reason, /UNAVAILABLE|no reviewer/i);
  assert.equal(existsSync(join(root, ".hatstack", "reviews")), false);
  rmSync(root, { recursive: true, force: true });
});

test("runReview: unknown hat exits 2", () => {
  const root = mkdtempSync(join(tmpdir(), "hs-rev-"));
  const res = runReview({ hat: "nope", root, config: { reviewer_cmd: "true" } });
  assert.equal(res.exitCode, 2);
  rmSync(root, { recursive: true, force: true });
});
