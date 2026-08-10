// TDD state machine. Time is injected on every call — nothing here reads the
// ambient clock, so the transitions are deterministic under test.
//
//   red (test failed)      -> source writes ALLOWED (write the impl)
//   green (test passed)    -> source writes ALLOWED until window_expires (refactor)
//   green, window expired  -> source writes DENIED until the next red
//   red, older than max age-> stale, DENIED (yesterday's failure can't authorise today)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

// A non-zero exit is the primary RED signal; this scan only catches runners
// that exit 0 on failure. It must NOT fire on passing output like "0 failed":
// the count alternative requires a non-zero count, and the marker alternative
// only matches FAIL/FAILED/ERROR at the start of a line (jest/pytest markers).
const FAIL_RE = /([1-9][0-9]*)\s+(failed|failing)\b|(^|\n)\s*(FAIL|FAILED|ERROR)\b/i;

// Decide red/green from the real exit code and the runner's output. A non-zero
// exit is authoritative; the text scan catches runners that exit 0 on failure.
export function classifyRun({ exitCode = 0, stdout = "", stderr = "" }) {
  if (exitCode !== 0) return "red";
  if (FAIL_RE.test(`${stdout}\n${stderr}`)) return "red";
  return "green";
}

// Build the state object a run should persist. `now` is unix seconds.
export function buildState({ status, command = "", now, config = {} }) {
  const window = Number(config.refactor_window_seconds ?? 600);
  const state = { status, command, ts: now };
  if (status === "green") state.window_expires = now + window;
  return state;
}

// The gate decision for a source write, given the recorded state.
export function evaluateTdd({ state, now, config = {} }) {
  if (!state || !state.status) {
    return {
      ok: false,
      phase: "none",
      reason:
        "TDD gate: no test run on record. Write a failing test for this change, run it via `hatstack test -- <cmd>` (or your project's test command), and watch it fail. Disable deliberately with tdd_gate:\"off\" in .hatstack/config.json or HATSTACK_TDD_OFF=1.",
    };
  }
  const maxAge = Number(config.tdd_state_max_age_seconds ?? 1800);
  const age = now - Number(state.ts ?? 0);

  if (state.status === "red") {
    if (age > maxAge) {
      return {
        ok: false,
        phase: "stale",
        reason: `TDD gate: the RED state is ${age}s old (max ${maxAge}s) and may not reflect the current tree. Re-run the test suite to refresh it.`,
      };
    }
    return { ok: true, phase: "red", reason: "RED on record — implement the minimum to pass." };
  }

  if (state.status === "green") {
    const expires = Number(state.window_expires ?? 0);
    if (now < expires) {
      return {
        ok: true,
        phase: "refactor",
        reason: `GREEN, refactor window open for ${expires - now}s more.`,
      };
    }
    return {
      ok: false,
      phase: "locked",
      reason:
        "TDD gate: last run was GREEN and the refactor window has closed. Write the next failing test before editing source, or refactor within a fresh green window.",
    };
  }

  return {
    ok: false,
    phase: "unknown",
    reason: `TDD gate: recorded status '${state.status}' is not red or green. Re-run the test suite.`,
  };
}

const STATE_PATH = (root) => join(root, ".hatstack", "state.json");

export function readState(root) {
  try {
    return JSON.parse(readFileSync(STATE_PATH(root), "utf8"));
  } catch {
    return null;
  }
}

export function writeState(root, state) {
  const path = STATE_PATH(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
  return path;
}
