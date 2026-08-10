import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, mergeConfig, DEFAULTS } from "../lib/config.mjs";

test("mergeConfig fills defaults", () => {
  const c = mergeConfig({ hats: ["seo"] });
  assert.deepEqual(c.hats, ["seo"]);
  assert.equal(c.tdd_gate, "on");
  assert.equal(c.refactor_window_seconds, DEFAULTS.refactor_window_seconds);
});

test("mergeConfig deep-merges media", () => {
  const c = mergeConfig({ media: { provider: "openrouter" } });
  assert.equal(c.media.provider, "openrouter");
  assert.equal(c.media.image_model, DEFAULTS.media.image_model);
});

test("loadConfig returns defaults when file is absent", () => {
  const root = mkdtempSync(join(tmpdir(), "hatstack-cfg-"));
  const c = loadConfig(root);
  assert.equal(c.tdd_gate, "on");
  rmSync(root, { recursive: true, force: true });
});

test("loadConfig reads and merges an existing file", () => {
  const root = mkdtempSync(join(tmpdir(), "hatstack-cfg-"));
  mkdirSync(join(root, ".hatstack"), { recursive: true });
  writeFileSync(join(root, ".hatstack", "config.json"), JSON.stringify({ tdd_gate: "off" }));
  assert.equal(loadConfig(root).tdd_gate, "off");
  rmSync(root, { recursive: true, force: true });
});

test("loadConfig throws on malformed JSON (fail loud, not silent)", () => {
  const root = mkdtempSync(join(tmpdir(), "hatstack-cfg-"));
  mkdirSync(join(root, ".hatstack"), { recursive: true });
  writeFileSync(join(root, ".hatstack", "config.json"), "{not json");
  assert.throws(() => loadConfig(root), /not valid JSON/);
  rmSync(root, { recursive: true, force: true });
});
