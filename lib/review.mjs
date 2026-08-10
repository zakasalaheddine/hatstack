// Review dispatch. The reviewer runs as a fresh process that never saw the
// building agent's context. Self-review is never a fallback — no reviewer
// available is a loud exit 3, not a quiet review-by-the-author.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";
import { parsePlan } from "./plan.mjs";

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Auto-detect order. Each entry: [binary, ...args]. reviewer_cmd overrides.
const CANDIDATES = [
  ["claude", "-p"],
  ["codex", "exec"],
  ["gemini", "-p"],
];

// Is a binary runnable? Injectable so tests never depend on the machine's PATH.
export function onPath(bin) {
  const r = spawnSync(process.platform === "win32" ? "where" : "command", ["-v", bin], {
    shell: process.platform !== "win32",
    stdio: "ignore",
  });
  return r.status === 0;
}

// Resolve the reviewer command as a token array, or null if none is available.
export function detectReviewer(config = {}, { has = onPath } = {}) {
  if (config.reviewer_cmd) {
    return Array.isArray(config.reviewer_cmd) ? config.reviewer_cmd : config.reviewer_cmd.split(/\s+/);
  }
  for (const cand of CANDIDATES) {
    if (has(cand[0])) return cand;
  }
  return null;
}

// A verdict line the rubric mandates. BLOCK is the only one that fails the gate.
export function parseVerdict(report) {
  const text = String(report ?? "");
  const m = /##\s*Verdict\s*\n+([^\n]+)/i.exec(text);
  const line = (m ? m[1] : text).toUpperCase();
  if (/\bBLOCK\b/.test(line)) return "BLOCK";
  if (/APPROVE WITH FINDINGS/.test(line)) return "APPROVE WITH FINDINGS";
  if (/\bAPPROVE\b/.test(line)) return "APPROVE";
  return "UNKNOWN";
}

function readIf(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

// Build the packet handed to the reviewer on stdin: the rubric it must apply,
// the approved plan, the success criteria, and the artifact under review.
export function assemblePacket({ rubric, planText, diff, filesNote }) {
  const parts = [];
  parts.push("You are performing an independent review. Apply the rubric below strictly.");
  parts.push("Return only the report in the rubric's format. Begin with the ## Verdict line.");
  parts.push("\n===== RUBRIC =====\n" + rubric);
  if (planText) parts.push("\n===== APPROVED PLAN =====\n" + planText);
  if (diff) parts.push("\n===== DIFF UNDER REVIEW =====\n" + diff);
  if (filesNote) parts.push("\n===== ARTIFACTS =====\n" + filesNote);
  return parts.join("\n");
}

function gitDiff(root, ref) {
  const args = ref ? ["diff", ref] : ["diff", "HEAD"];
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

const isoDate = () => new Date().toISOString().slice(0, 10);

// Orchestrate a review. Returns { exitCode, reportPath, verdict, reason }.
// spawnFn is injectable so tests drive a fake reviewer without a real CLI.
export function runReview({
  hat,
  root = process.cwd(),
  diff,
  files,
  config = null,
  spawnFn = spawnSync,
  detect = detectReviewer,
  date = isoDate,
} = {}) {
  if (!hat) return emit(2, "usage: hatstack review <hat> [--diff REF] [--files GLOB]");

  const cfg = config || loadConfig(root);
  const rubricPath = join(PKG_ROOT, "hats", hat, "reviewer.md");
  if (!existsSync(rubricPath)) {
    return emit(2, `hatstack review: no rubric at hats/${hat}/reviewer.md. Known hats live under hats/.`);
  }
  const rubric = readFileSync(rubricPath, "utf8");

  const reviewer = detect(cfg);
  if (!reviewer) {
    return emit(
      3,
      "hatstack review: no reviewer CLI found (looked for claude, codex, gemini). Install one or set reviewer_cmd in .hatstack/config.json. Review is UNAVAILABLE — it never falls back to self-review."
    );
  }

  // Assemble the packet.
  let planText = null;
  const activePath = readIf(join(root, ".hatstack", "active-plan"));
  if (activePath) {
    const p = activePath.trim();
    planText = readIf(isAbsolute(p) ? p : join(root, p));
  }
  const diffText = files ? null : gitDiff(root, diff);
  const filesNote = files ? `Named artifacts to review (glob): ${files}` : null;
  const packet = assemblePacket({ rubric, planText, diff: diffText, filesNote });

  // Dispatch to a fresh process. The packet is stdin; the builder's context is
  // simply not present in this process.
  const proc = spawnFn(reviewer[0], reviewer.slice(1), {
    input: packet,
    encoding: "utf8",
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (proc.error) {
    return emit(3, `hatstack review: reviewer '${reviewer.join(" ")}' failed to start: ${proc.error.message}`);
  }
  const report = (proc.stdout || "").trim() || "(reviewer produced no output)";

  const dir = join(root, ".hatstack", "reviews");
  mkdirSync(dir, { recursive: true });
  const reportPath = join(dir, `${date()}-${hat}.md`);
  writeFileSync(reportPath, report + "\n");

  const verdict = parseVerdict(report);
  const exitCode = verdict === "BLOCK" ? 1 : 0;
  return {
    exitCode,
    reportPath,
    verdict,
    reason: `hatstack review: ${verdict} — report written to ${reportPath}`,
  };

  function emit(exitCode, reason) {
    return { exitCode, reason, reportPath: null, verdict: null };
  }
}
