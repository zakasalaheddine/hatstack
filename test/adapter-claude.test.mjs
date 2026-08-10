import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const BIN = join(PKG, "bin", "hatstack.mjs");

function hook(which, payload, root) {
  return spawnSync("node", [BIN, "hook", which, "--root", root], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
}

test("pre-write hook emits an allow decision for a test file", () => {
  const root = mkdtempSync(join(tmpdir(), "hs-hook-"));
  mkdirSync(join(root, ".hatstack"), { recursive: true });
  writeFileSync(join(root, ".hatstack", "config.json"), JSON.stringify({ src_globs: ["src/"] }));
  const r = hook("claude-pre-write", { tool_input: { file_path: "src/a.test.js" } }, root);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(out.hookSpecificOutput.permissionDecision, "allow");
  rmSync(root, { recursive: true, force: true });
});

test("pre-write hook emits a deny decision with reason for gated source, no RED", () => {
  const root = mkdtempSync(join(tmpdir(), "hs-hook-"));
  mkdirSync(join(root, ".hatstack"), { recursive: true });
  writeFileSync(join(root, ".hatstack", "config.json"), JSON.stringify({ src_globs: ["src/"] }));
  const r = hook("claude-pre-write", { tool_input: { file_path: "src/a.js" } }, root);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /TDD gate/);
  rmSync(root, { recursive: true, force: true });
});

test("post-bash hook records RED from a failing test command", () => {
  const root = mkdtempSync(join(tmpdir(), "hs-hook-"));
  mkdirSync(join(root, ".hatstack"), { recursive: true });
  writeFileSync(join(root, ".hatstack", "config.json"), JSON.stringify({ test_command_pattern: "npm test" }));
  const r = hook(
    "claude-post-bash",
    { tool_input: { command: "npm test" }, tool_response: { returncode: 1, stdout: "1 failing" } },
    root
  );
  const out = JSON.parse(r.stdout);
  assert.match(out.hookSpecificOutput.additionalContext, /RED recorded/);
  const state = JSON.parse(readFileSync(join(root, ".hatstack", "state.json"), "utf8"));
  assert.equal(state.status, "red");
  rmSync(root, { recursive: true, force: true });
});

test("post-bash hook ignores non-test commands", () => {
  const root = mkdtempSync(join(tmpdir(), "hs-hook-"));
  mkdirSync(join(root, ".hatstack"), { recursive: true });
  const r = hook("claude-post-bash", { tool_input: { command: "ls -la" }, tool_response: { returncode: 0 } }, root);
  assert.equal(r.stdout.trim(), "");
  rmSync(root, { recursive: true, force: true });
});

test("the Claude reviewer agent does not fork from the canonical hat rubric", () => {
  const rubric = readFileSync(join(PKG, "hats", "eng", "reviewer.md"), "utf8");
  const agent = readFileSync(join(PKG, "adapters", "claude-code", "agents", "eng-reviewer.md"), "utf8");
  // Distinctive lines from the rubric must be present verbatim in the agent file.
  for (const line of [
    "You are a staff engineer reviewing code you did not write.",
    "An approval without this is not a review.",
    "Rank honestly.",
  ]) {
    assert.ok(rubric.includes(line), `rubric missing: ${line}`);
    assert.ok(agent.includes(line), `agent drifted, missing: ${line}`);
  }
});

test("the Claude plugin manifest is valid JSON with the expected wiring", () => {
  const manifest = JSON.parse(
    readFileSync(join(PKG, "adapters", "claude-code", ".claude-plugin", "plugin.json"), "utf8")
  );
  assert.equal(manifest.name, "hatstack");
  assert.equal(manifest.hooks, "./hooks/hooks.json");
  const hooks = JSON.parse(readFileSync(join(PKG, "adapters", "claude-code", "hooks", "hooks.json"), "utf8"));
  assert.ok(hooks.hooks.PreToolUse[0].matcher.includes("Write"));
  assert.ok(hooks.hooks.PostToolUse[0].matcher.includes("Bash"));
});
