// Machine-scope installer. One host = one table row: detect path, install path,
// what to link. Adding a host is a row, not a code path.
//
// Rules the installer holds to:
//   - Never install to a host that is not there (detection = the host's own dir).
//   - Idempotent: running twice changes nothing.
//   - Reversible: --uninstall removes exactly what the manifest records, nothing else.
//   - Never overwrites a foreign file: an existing non-hatstack path aborts that host.
import {
  existsSync,
  lstatSync,
  readlinkSync,
  symlinkSync,
  mkdirSync,
  rmSync,
  cpSync,
  readFileSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// The host table. `source` is what gets linked into `target`.
export function hostTable(home, pkg = PKG_ROOT) {
  return [
    {
      id: "claude-code",
      detect: join(home, ".claude"),
      target: join(home, ".claude", "plugins", "hatstack"),
      source: pkg, // the whole plugin — CLAUDE_PLUGIN_ROOT resolves bin/ through the link
    },
    {
      id: "codex",
      detect: join(home, ".codex"),
      target: join(home, ".codex", "skills", "hatstack"),
      source: join(pkg, "adapters", "codex"),
    },
    {
      id: "cursor",
      detect: join(home, ".cursor"),
      target: join(home, ".cursor", "skills", "hatstack"),
      source: join(pkg, "adapters", "cursor"),
    },
    {
      id: "gemini",
      detect: join(home, ".gemini"),
      target: join(home, ".gemini", "extensions", "hatstack"),
      source: join(pkg, "adapters", "gemini"),
    },
  ];
}

function manifestPath(home) {
  return join(home, ".hatstack", "install-manifest.json");
}
function readManifest(home) {
  try {
    return JSON.parse(readFileSync(manifestPath(home), "utf8"));
  } catch {
    return { installs: [] };
  }
}
function writeManifest(home, manifest) {
  const p = manifestPath(home);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(manifest, null, 2) + "\n");
}

// Is `target` already our install of `source`? A symlink to source, or a
// manifest-recorded target, counts as ours.
function isOurs(target, source, manifest) {
  if (manifest.installs.some((i) => i.target === target)) return true;
  try {
    if (lstatSync(target).isSymbolicLink()) {
      const dest = readlinkSync(target);
      const resolved = dest === source ? source : realpathSync(target);
      return resolved === source || dest === source;
    }
  } catch {
    /* not a symlink / unreadable */
  }
  return false;
}

// Perform (or reverse) the machine install. Returns { exitCode, results }.
export function install({
  host = undefined,
  copy = false,
  uninstall = false,
  home = homedir(),
  log = (m) => process.stdout.write(m + "\n"),
} = {}) {
  const results = [];
  const rows = hostTable(home).filter((r) => !host || r.id === host);
  if (host && rows.length === 0) {
    log(`hatstack install: unknown host '${host}'. Known: claude-code, codex, cursor, gemini.`);
    return { exitCode: 2, results };
  }

  const manifest = readManifest(home);

  if (uninstall) {
    const kept = [];
    for (const entry of manifest.installs) {
      if (host && entry.host !== host) {
        kept.push(entry);
        continue;
      }
      // Only ever remove exactly what we recorded.
      try {
        if (existsSync(entry.target) || lstatSync(entry.target)) {
          rmSync(entry.target, { recursive: true, force: true });
        }
      } catch {
        /* already gone */
      }
      results.push({ host: entry.host, action: "removed", detail: entry.target });
      log(`hatstack: removed ${entry.host} -> ${entry.target}`);
    }
    writeManifest(home, { installs: kept });
    if (results.length === 0) log("hatstack: nothing to uninstall.");
    return { exitCode: 0, results };
  }

  let aborted = false;
  for (const row of rows) {
    if (!existsSync(row.detect)) {
      results.push({ host: row.id, action: "skipped", detail: "host not installed" });
      log(`hatstack: skipped ${row.id} (no ${row.detect})`);
      continue;
    }

    if (existsSync(row.target) || safeIsLink(row.target)) {
      if (isOurs(row.target, row.source, manifest)) {
        results.push({ host: row.id, action: "unchanged", detail: row.target });
        log(`hatstack: ${row.id} already linked (${row.target})`);
        // Ensure it is recorded even if the manifest was lost.
        if (!manifest.installs.some((i) => i.target === row.target)) {
          manifest.installs.push({ host: row.id, target: row.target, style: copy ? "copy" : "symlink", source: row.source });
        }
        continue;
      }
      // Foreign file at the target path: abort this host, name the path, touch nothing.
      results.push({ host: row.id, action: "aborted", detail: `foreign file at ${row.target}` });
      log(`hatstack: ABORT ${row.id} — a non-hatstack file already exists at ${row.target}. Move it aside and re-run.`);
      aborted = true;
      continue;
    }

    mkdirSync(dirname(row.target), { recursive: true });
    if (copy) {
      cpSync(row.source, row.target, { recursive: true });
    } else {
      symlinkSync(row.source, row.target, "dir");
    }
    manifest.installs.push({ host: row.id, target: row.target, style: copy ? "copy" : "symlink", source: row.source });
    results.push({ host: row.id, action: copy ? "copied" : "linked", detail: row.target });
    log(`hatstack: ${copy ? "copied" : "linked"} ${row.id} -> ${row.target}`);
  }

  writeManifest(home, manifest);
  return { exitCode: aborted ? 2 : 0, results };
}

function safeIsLink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}
