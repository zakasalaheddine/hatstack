// `hatstack init` — project scope. Scaffold .hatstack/, install the git
// pre-commit backstop, write a starter config. Idempotent: running twice
// changes nothing, and it never clobbers a foreign pre-commit hook.
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS } from "./config.mjs";

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const STARTER_CONFIG = {
  hats: DEFAULTS.hats,
  plan_gate: "on",
  tdd_gate: "on",
  accept_gate: "on",
  src_globs: DEFAULTS.src_globs,
  deliverable_globs: DEFAULTS.deliverable_globs,
  test_command_pattern: DEFAULTS.test_command_pattern,
  tdd_state_max_age_seconds: DEFAULTS.tdd_state_max_age_seconds,
  refactor_window_seconds: DEFAULTS.refactor_window_seconds,
  reviewer_cmd: null,
  media: DEFAULTS.media,
};

// Marker so we can recognise our own hook and safely overwrite it on re-init.
const HOOK_MARKER = "# hatstack git pre-commit backstop.";

export function init({ root = process.cwd(), log = (m) => process.stdout.write(m + "\n") } = {}) {
  const changes = [];

  for (const dir of ["plans", "reviews"]) {
    const p = join(root, ".hatstack", dir);
    if (!existsSync(p)) {
      mkdirSync(p, { recursive: true });
      changes.push(`created .hatstack/${dir}/`);
    }
  }

  const cfgPath = join(root, ".hatstack", "config.json");
  if (!existsSync(cfgPath)) {
    writeFileSync(cfgPath, JSON.stringify(STARTER_CONFIG, null, 2) + "\n");
    changes.push("wrote .hatstack/config.json");
  }

  // gitignore volatile state so it never gets committed.
  const giPath = join(root, ".hatstack", ".gitignore");
  const giBody = "state.json\nreviews/\nmedia/\n";
  if (!existsSync(giPath)) {
    writeFileSync(giPath, giBody);
    changes.push("wrote .hatstack/.gitignore");
  }

  // Project-local instruction files for the soft-enforcement harnesses, so an
  // agent working in this repo sees the loop. Never clobber an existing file.
  const drops = [
    [join(PKG_ROOT, "adapters", "codex", "AGENTS.md"), join(root, "AGENTS.md")],
    [join(PKG_ROOT, "adapters", "gemini", "GEMINI.md"), join(root, "GEMINI.md")],
    [join(PKG_ROOT, "adapters", "cursor", ".cursorrules"), join(root, ".cursorrules")],
  ];
  for (const [src, dest] of drops) {
    if (!existsSync(dest)) {
      writeFileSync(dest, readFileSync(src, "utf8"));
      changes.push(`dropped ${dest.slice(root.length + 1)}`);
    }
  }

  // git pre-commit backstop.
  const gitDir = join(root, ".git");
  if (existsSync(gitDir)) {
    const hookPath = join(gitDir, "hooks", "pre-commit");
    const template = readFileSync(join(PKG_ROOT, "adapters", "git", "pre-commit"), "utf8");
    const entry = join(PKG_ROOT, "bin", "hatstack.mjs");
    const rendered = template.replaceAll("__HATSTACK_ENTRY__", entry);

    if (existsSync(hookPath)) {
      const existing = readFileSync(hookPath, "utf8");
      if (existing.includes(HOOK_MARKER)) {
        if (existing !== rendered) {
          writeFileSync(hookPath, rendered);
          chmodSync(hookPath, 0o755);
          changes.push("refreshed .git/hooks/pre-commit");
        }
      } else {
        log(
          "hatstack: a non-hatstack .git/hooks/pre-commit already exists — not overwriting it. Add `hatstack check plan` and `hatstack check tdd --file <f>` to it by hand, or move it aside and re-run init."
        );
      }
    } else {
      mkdirSync(dirname(hookPath), { recursive: true });
      writeFileSync(hookPath, rendered);
      chmodSync(hookPath, 0o755);
      changes.push("installed .git/hooks/pre-commit");
    }
  } else {
    log("hatstack: no .git directory — skipped the pre-commit backstop.");
  }

  if (changes.length === 0) log("hatstack: already initialised, nothing to change.");
  else changes.forEach((c) => log("hatstack: " + c));
  return { changes };
}
