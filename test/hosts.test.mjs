import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, lstatSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { install, hostTable } from "../lib/hosts.mjs";

// Every test uses a fake HOME under tmp. The real home directory is never touched.
function fakeHome(hosts = []) {
  const home = mkdtempSync(join(tmpdir(), "hs-home-"));
  for (const h of hosts) mkdirSync(join(home, h), { recursive: true });
  return home;
}
const silent = () => {};

test("installs only into hosts that are present, skips the rest", () => {
  const home = fakeHome([".claude", ".codex"]); // cursor + gemini absent
  const { exitCode, results } = install({ home, log: silent });
  assert.equal(exitCode, 0);
  const byHost = Object.fromEntries(results.map((r) => [r.host, r.action]));
  assert.equal(byHost["claude-code"], "linked");
  assert.equal(byHost["codex"], "linked");
  assert.equal(byHost["cursor"], "skipped");
  assert.equal(byHost["gemini"], "skipped");
  assert.ok(existsSync(join(home, ".claude", "plugins", "hatstack")));
  assert.ok(lstatSync(join(home, ".codex", "skills", "hatstack")).isSymbolicLink());
  rmSync(home, { recursive: true, force: true });
});

test("second run is a no-op (idempotent)", () => {
  const home = fakeHome([".claude"]);
  install({ home, log: silent });
  const second = install({ home, log: silent });
  assert.equal(second.results.find((r) => r.host === "claude-code").action, "unchanged");
  rmSync(home, { recursive: true, force: true });
});

test("uninstall restores the tree exactly", () => {
  const home = fakeHome([".claude", ".gemini"]);
  install({ home, log: silent });
  assert.ok(existsSync(join(home, ".claude", "plugins", "hatstack")));
  const un = install({ home, uninstall: true, log: silent });
  assert.equal(un.exitCode, 0);
  assert.equal(existsSync(join(home, ".claude", "plugins", "hatstack")), false);
  assert.equal(existsSync(join(home, ".gemini", "extensions", "hatstack")), false);
  // The host's own directory is untouched — only our link is gone.
  assert.ok(existsSync(join(home, ".claude")));
  const manifest = JSON.parse(readFileSync(join(home, ".hatstack", "install-manifest.json"), "utf8"));
  assert.equal(manifest.installs.length, 0);
  rmSync(home, { recursive: true, force: true });
});

test("a foreign file at the target aborts that host without writing", () => {
  const home = fakeHome([".claude"]);
  mkdirSync(join(home, ".claude", "plugins"), { recursive: true });
  const foreign = join(home, ".claude", "plugins", "hatstack");
  writeFileSync(foreign, "someone else's file");
  const { exitCode, results } = install({ home, log: silent });
  assert.equal(exitCode, 2);
  assert.equal(results.find((r) => r.host === "claude-code").action, "aborted");
  // The foreign file is left exactly as it was.
  assert.equal(readFileSync(foreign, "utf8"), "someone else's file");
  rmSync(home, { recursive: true, force: true });
});

test("--copy materialises files and uninstall removes them", () => {
  const home = fakeHome([".codex"]);
  install({ home, copy: true, log: silent });
  const target = join(home, ".codex", "skills", "hatstack");
  assert.equal(lstatSync(target).isSymbolicLink(), false);
  assert.ok(existsSync(join(target, "AGENTS.md")));
  install({ home, uninstall: true, log: silent });
  assert.equal(existsSync(target), false);
  rmSync(home, { recursive: true, force: true });
});

test("--host limits the operation to one harness", () => {
  const home = fakeHome([".claude", ".codex"]);
  const { results } = install({ home, host: "codex", log: silent });
  assert.equal(results.length, 1);
  assert.equal(results[0].host, "codex");
  assert.equal(existsSync(join(home, ".claude", "plugins", "hatstack")), false);
  rmSync(home, { recursive: true, force: true });
});

test("host table exposes one row per documented harness", () => {
  const rows = hostTable("/home/x");
  assert.deepEqual(rows.map((r) => r.id).sort(), ["claude-code", "codex", "cursor", "gemini"]);
});
