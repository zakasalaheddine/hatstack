import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const BIN = join(PKG, "bin", "hatstack.mjs");

function run(args, opts = {}) {
  return spawnSync("node", [BIN, ...args], { encoding: "utf8", ...opts });
}

test("check plan is inert (exit 0) with no active plan", () => {
  const root = mkdtempSync(join(tmpdir(), "hs-cli-"));
  const r = run(["check", "plan", "--root", root]);
  assert.equal(r.status, 0);
  rmSync(root, { recursive: true, force: true });
});

test("check tdd denies a source write with no state (exit 2)", () => {
  const root = mkdtempSync(join(tmpdir(), "hs-cli-"));
  mkdirSync(join(root, ".hatstack"), { recursive: true });
  writeFileSync(join(root, ".hatstack", "config.json"), JSON.stringify({ src_globs: ["src/"] }));
  const r = run(["check", "tdd", "--root", root, "--file", "src/a.js"]);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /no test run on record/);
  rmSync(root, { recursive: true, force: true });
});

test("hatstack test records RED from a failing command, then tdd allows", () => {
  const root = mkdtempSync(join(tmpdir(), "hs-cli-"));
  mkdirSync(join(root, ".hatstack"), { recursive: true });
  writeFileSync(join(root, ".hatstack", "config.json"), JSON.stringify({ src_globs: ["src/"] }));
  const r = run(["test", "--root", root, "--", "node", "-e", "process.exit(1)"]);
  assert.equal(r.status, 1);
  const state = JSON.parse(readFileSync(join(root, ".hatstack", "state.json"), "utf8"));
  assert.equal(state.status, "red");
  // now a source write is allowed
  const g = run(["check", "tdd", "--root", root, "--file", "src/a.js"]);
  assert.equal(g.status, 0);
  rmSync(root, { recursive: true, force: true });
});

test("hatstack test records GREEN from a passing command", () => {
  const root = mkdtempSync(join(tmpdir(), "hs-cli-"));
  mkdirSync(join(root, ".hatstack"), { recursive: true });
  writeFileSync(join(root, ".hatstack", "config.json"), JSON.stringify({ src_globs: ["src/"] }));
  const r = run(["test", "--root", root, "--", "node", "-e", "process.exit(0)"]);
  assert.equal(r.status, 0);
  const state = JSON.parse(readFileSync(join(root, ".hatstack", "state.json"), "utf8"));
  assert.equal(state.status, "green");
  rmSync(root, { recursive: true, force: true });
});

test("unknown command exits 2", () => {
  const r = run(["frobnicate"]);
  assert.equal(r.status, 2);
});

test("init scaffolds .hatstack and is idempotent", () => {
  const root = mkdtempSync(join(tmpdir(), "hs-init-"));
  const first = run(["init", "--root", root]);
  assert.equal(first.status, 0);
  assert.ok(existsSync(join(root, ".hatstack", "config.json")));
  assert.ok(existsSync(join(root, ".hatstack", "plans")));
  assert.ok(existsSync(join(root, "AGENTS.md")), "init should drop the Codex adapter file");
  assert.ok(existsSync(join(root, ".cursorrules")), "init should drop the Cursor adapter file");
  const second = run(["init", "--root", root]);
  assert.match(second.stdout, /already initialised/);
  rmSync(root, { recursive: true, force: true });
});

test("init never clobbers an existing AGENTS.md", () => {
  const root = mkdtempSync(join(tmpdir(), "hs-init-"));
  writeFileSync(join(root, "AGENTS.md"), "MY OWN INSTRUCTIONS");
  run(["init", "--root", root]);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), "MY OWN INSTRUCTIONS");
  rmSync(root, { recursive: true, force: true });
});

test("init installs a working pre-commit hook that blocks a source commit with no RED", () => {
  const root = mkdtempSync(join(tmpdir(), "hs-git-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: root });
  execFileSync("git", ["config", "user.name", "t"], { cwd: root });
  run(["init", "--root", root]);
  assert.ok(existsSync(join(root, ".git", "hooks", "pre-commit")));

  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "a.js"), "export const x = 1;\n");
  execFileSync("git", ["add", "src/a.js", ".hatstack"], { cwd: root });
  const commit = spawnSync("git", ["commit", "-m", "add source"], { cwd: root, encoding: "utf8" });
  assert.notEqual(commit.status, 0, "commit should be blocked by the TDD gate");
  assert.match(commit.stderr, /TDD gate/);
  rmSync(root, { recursive: true, force: true });
});

test("pre-commit hook allows a commit once RED is on record", () => {
  const root = mkdtempSync(join(tmpdir(), "hs-git2-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: root });
  execFileSync("git", ["config", "user.name", "t"], { cwd: root });
  run(["init", "--root", root]);
  run(["test", "--root", root, "--", "node", "-e", "process.exit(1)"]); // RED
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "a.js"), "export const x = 1;\n");
  execFileSync("git", ["add", "src/a.js"], { cwd: root });
  const commit = spawnSync("git", ["commit", "-m", "add source"], { cwd: root, encoding: "utf8" });
  assert.equal(commit.status, 0, commit.stderr);
  rmSync(root, { recursive: true, force: true });
});
