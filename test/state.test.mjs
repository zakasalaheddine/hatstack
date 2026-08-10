import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRun, buildState, evaluateTdd } from "../lib/state.mjs";

const cfg = { refactor_window_seconds: 600, tdd_state_max_age_seconds: 1800 };

test("classifyRun: non-zero exit is red", () => {
  assert.equal(classifyRun({ exitCode: 1, stdout: "all good" }), "red");
});

test("classifyRun: zero exit, clean output is green", () => {
  assert.equal(classifyRun({ exitCode: 0, stdout: "5 passing" }), "green");
});

test("classifyRun: zero exit but failure text is red", () => {
  assert.equal(classifyRun({ exitCode: 0, stdout: "3 failed, 2 passed" }), "red");
  assert.equal(classifyRun({ exitCode: 0, stderr: "FAIL src/x.test.js" }), "red");
});

test("buildState: green carries a window, red does not", () => {
  const g = buildState({ status: "green", now: 1000, config: cfg });
  assert.equal(g.window_expires, 1600);
  const r = buildState({ status: "red", now: 1000, config: cfg });
  assert.equal(r.window_expires, undefined);
  assert.equal(r.ts, 1000);
});

test("no state on record -> deny", () => {
  const v = evaluateTdd({ state: null, now: 1000, config: cfg });
  assert.equal(v.ok, false);
  assert.equal(v.phase, "none");
});

test("fresh RED allows source writes", () => {
  const state = buildState({ status: "red", now: 1000, config: cfg });
  const v = evaluateTdd({ state, now: 1005, config: cfg });
  assert.equal(v.ok, true);
  assert.equal(v.phase, "red");
});

test("stale RED (older than max age) denies", () => {
  const state = buildState({ status: "red", now: 0, config: cfg });
  const v = evaluateTdd({ state, now: 1801, config: cfg });
  assert.equal(v.ok, false);
  assert.equal(v.phase, "stale");
});

test("green then immediate source edit is allowed (refactor)", () => {
  const state = buildState({ status: "green", now: 1000, config: cfg });
  const v = evaluateTdd({ state, now: 1000, config: cfg });
  assert.equal(v.ok, true);
  assert.equal(v.phase, "refactor");
});

test("the same edit 11 minutes later is denied (window closed)", () => {
  const state = buildState({ status: "green", now: 1000, config: cfg });
  const v = evaluateTdd({ state, now: 1000 + 11 * 60, config: cfg });
  assert.equal(v.ok, false);
  assert.equal(v.phase, "locked");
});

test("window boundary: exactly at expiry is locked, one second before is open", () => {
  const state = buildState({ status: "green", now: 1000, config: cfg });
  assert.equal(evaluateTdd({ state, now: 1599, config: cfg }).ok, true);
  assert.equal(evaluateTdd({ state, now: 1600, config: cfg }).ok, false);
});
