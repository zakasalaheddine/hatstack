// The three gates: plan, tdd, accept. Each returns { ok, reason, exitCode }.
// Nothing about any harness appears here — adapters translate the exit code.
//
//   0 allow | 2 deny (reason on stdout, for the agent) | 3 cannot evaluate (deny)
import { readFileSync } from "node:fs";
import { join, isAbsolute, relative } from "node:path";
import { parsePlan } from "./plan.mjs";
import { readState, evaluateTdd } from "./state.mjs";

export const ALLOW = { ok: true, reason: "", exitCode: 0 };
const deny = (reason) => ({ ok: false, reason, exitCode: 2 });
const cannot = (reason) => ({ ok: false, reason, exitCode: 3 });

// Compare a file path against a project against config globs. Absolute paths
// are made project-relative first so `src/` matches regardless of how the file
// was addressed. A path outside the project never matches a project glob.
function relToRoot(file, root) {
  if (!file) return "";
  const abs = isAbsolute(file) ? file : join(root, file);
  const rel = relative(root, abs);
  if (rel.startsWith("..")) return null; // outside the project
  return rel.split("\\").join("/");
}

const TEST_RE = /(^|\/)([^/]*\.(test|spec)\.[^/]+)$|(^|\/)(__tests__|tests?|spec|cypress|e2e|fixtures?)(\/|$)/i;
const NONSOURCE_RE = /\.(md|mdx|txt|json|ya?ml|toml|lock)$|(^|\/)\.env|(^|\/)\.gitignore$/i;
const EXEMPT_DIR_RE = /(^|\/)(\.hatstack|docs|plans)(\/|$)/i;

// A path the TDD gate always lets through: the test itself, docs, config, and
// hatstack's own dir. You must always be able to write the failing test.
export function isTddExempt(rel) {
  if (rel == null) return true;
  return TEST_RE.test(rel) || NONSOURCE_RE.test(rel) || EXEMPT_DIR_RE.test(rel);
}

export function isUnderGlobs(rel, globs) {
  if (rel == null) return false;
  return globs.some((g) => {
    const clean = g.replace(/\/$/, "");
    return rel === clean || rel.startsWith(clean + "/") || rel.includes("/" + clean + "/");
  });
}

function envOff(name) {
  return process.env[name] === "1";
}

// ---- plan gate --------------------------------------------------------------
export function checkPlan({ root = process.cwd(), config = {} } = {}) {
  if (envOff("HATSTACK_PLAN_GATE_OFF") || config.plan_gate === "off") return ALLOW;

  let activePath;
  try {
    activePath = readFileSync(join(root, ".hatstack", "active-plan"), "utf8").trim();
  } catch {
    return ALLOW; // no active plan -> ad-hoc work is unaffected
  }
  if (!activePath) return ALLOW;

  const planFile = isAbsolute(activePath) ? activePath : join(root, activePath);
  let md;
  try {
    md = readFileSync(planFile, "utf8");
  } catch {
    return cannot(
      `Plan gate: active plan '${activePath}' is missing or unreadable. Re-run the hat's plan command, or clear .hatstack/active-plan.`
    );
  }

  const plan = parsePlan(md);
  const enough = plan.approachCount >= 3 || (plan.approachCount >= 2 && plan.hasConstrainedSpace);
  if (!enough) {
    return deny(
      `Plan gate: '${activePath}' has ${plan.approachCount} approach(es); 3 are required. Give each its own '## Approach N' section with Pros, Cons, Reversibility and Cost. If only two genuine strategies exist, add a '## Constrained space' section naming the disqualified third and why — do not pad with a fake option.`
    );
  }

  const bad = plan.approaches.find((a) => a.missing.length > 0);
  if (bad) {
    return deny(
      `Plan gate: '${bad.name}' is missing ${bad.missing.join(", ")}. Every approach needs Pros, Cons, Reversibility and Cost.`
    );
  }

  if (!plan.approved) {
    return deny(
      `Plan gate: '${activePath}' has no non-empty APPROVED line. Present the approaches to the human with the harness's question primitive, then write 'APPROVED: <approach name> — <date>'. Never write this line yourself — it is the human's signature.`
    );
  }

  return ALLOW;
}

// ---- tdd gate ---------------------------------------------------------------
export function checkTdd({ root = process.cwd(), config = {}, file, now } = {}) {
  if (envOff("HATSTACK_TDD_OFF") || config.tdd_gate === "off") return ALLOW;

  const rel = relToRoot(file, root);
  if (isTddExempt(rel)) return ALLOW;

  const globs = config.src_globs || [];
  if (!isUnderGlobs(rel, globs)) return ALLOW; // not project source

  const state = readState(root);
  const verdict = evaluateTdd({ state, now, config });
  if (verdict.ok) return { ...ALLOW, reason: verdict.reason };
  return deny(`${verdict.reason} (file: ${rel})`);
}

// ---- accept gate (non-code hats) --------------------------------------------
export function checkAccept({ root = process.cwd(), config = {}, file } = {}) {
  if (envOff("HATSTACK_ACCEPT_GATE_OFF") || config.accept_gate === "off") return ALLOW;

  const rel = relToRoot(file, root);
  // Plans and docs are never gated — you must always be able to write criteria.
  if (rel == null || EXEMPT_DIR_RE.test(rel)) return ALLOW;

  const globs = config.deliverable_globs || [];
  if (!isUnderGlobs(rel, globs)) return ALLOW;

  let activePath;
  try {
    activePath = readFileSync(join(root, ".hatstack", "active-plan"), "utf8").trim();
  } catch {
    return deny(
      `Accept gate: writing a deliverable ('${rel}') with no active plan. Run the hat's plan command and declare '## Success criteria' first.`
    );
  }
  const planFile = isAbsolute(activePath) ? activePath : join(root, activePath);
  let md;
  try {
    md = readFileSync(planFile, "utf8");
  } catch {
    return cannot(`Accept gate: active plan '${activePath}' is unreadable. Re-run the hat's plan command.`);
  }
  const plan = parsePlan(md);
  if (plan.criteria.length === 0) {
    return deny(
      `Accept gate: '${activePath}' declares zero success criteria. Add a '## Success criteria' section with at least one '- [ ]' checkbox before writing '${rel}'. The reviewer ticks the boxes, never the building agent.`
    );
  }
  return ALLOW;
}
