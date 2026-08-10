// Configuration loading with defaults. Every other module takes a resolved
// config object; nobody reads .hatstack/config.json directly except this file.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULTS = {
  hats: ["eng"],
  plan_gate: "on",
  tdd_gate: "on",
  accept_gate: "on",
  src_globs: ["src/", "app/", "lib/", "packages/", "components/"],
  deliverable_globs: ["content/", "briefs/", "campaigns/", "ledger/"],
  test_command_pattern:
    "(vitest|jest|pytest|cargo test|go test|npm (run )?test|pnpm (run )?test|bun test|yarn test|rspec|phpunit|cypress run|playwright test)",
  tdd_state_max_age_seconds: 1800,
  refactor_window_seconds: 600,
  reviewer_cmd: null,
  media: { provider: "fal", image_model: "fal-ai/flux/dev" },
};

// Merge parsed JSON over the defaults. Shallow for top-level keys; `media` is
// merged one level deep so a partial `media` block keeps the other defaults.
export function mergeConfig(parsed) {
  if (!parsed || typeof parsed !== "object") return { ...DEFAULTS };
  const merged = { ...DEFAULTS, ...parsed };
  merged.media = { ...DEFAULTS.media, ...(parsed.media || {}) };
  return merged;
}

// Resolve the project root's config. Missing file -> defaults. Malformed JSON
// is surfaced, not swallowed: a broken config must not silently disable a gate.
export function loadConfig(root = process.env.CLAUDE_PROJECT_DIR || process.cwd()) {
  const path = join(root, ".hatstack", "config.json");
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return { ...DEFAULTS, media: { ...DEFAULTS.media } };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`hatstack: ${path} is not valid JSON: ${err.message}`);
  }
  return mergeConfig(parsed);
}
