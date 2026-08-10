// Claude Code hook adapters. These translate the gate exit contract into the
// hook JSON Claude Code expects. All JSON escaping happens here in Node — the
// shell wrapper is a one-liner, so no jq, honouring the zero-dependency rule.
import { loadConfig } from "./config.mjs";
import { checkPlan, checkTdd, checkAccept } from "./gates.mjs";
import { classifyRun, buildState, writeState } from "./state.mjs";

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

function parse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

function preWriteDecision(payload, root, now) {
  let config;
  try {
    config = loadConfig(root);
  } catch (err) {
    return { permissionDecision: "deny", permissionDecisionReason: err.message };
  }
  const file = payload?.tool_input?.file_path || payload?.tool_input?.path || "";

  // Run all applicable gates; deny on the first that denies, with its reason.
  for (const result of [
    checkPlan({ root, config }),
    checkTdd({ root, config, file, now }),
    checkAccept({ root, config, file }),
  ]) {
    if (!result.ok) {
      return { permissionDecision: "deny", permissionDecisionReason: result.reason };
    }
  }
  return { permissionDecision: "allow" };
}

// PreToolUse on Write|Edit -> allow/deny decision JSON.
export async function claudePreWrite({ root = process.env.CLAUDE_PROJECT_DIR || process.cwd() } = {}) {
  const payload = parse(await readStdin());
  const decision = preWriteDecision(payload, root, nowSeconds());
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", ...decision } }) + "\n"
  );
  return { exitCode: 0 };
}

// PostToolUse on Bash -> if the command was a test run, record RED/GREEN.
export async function claudePostBash({ root = process.env.CLAUDE_PROJECT_DIR || process.cwd() } = {}) {
  const payload = parse(await readStdin());
  const cmd = payload?.tool_input?.command || "";
  if (!cmd) return { exitCode: 0 };

  let config;
  try {
    config = loadConfig(root);
  } catch {
    return { exitCode: 0 };
  }
  const pattern = new RegExp(config.test_command_pattern);
  if (!pattern.test(cmd)) return { exitCode: 0 };

  const resp = payload?.tool_response || {};
  const exitCode = Number(resp.returncode ?? resp.exit_code ?? 0);
  const status = classifyRun({ exitCode, stdout: resp.stdout || "", stderr: resp.stderr || "" });
  writeState(root, buildState({ status, command: cmd, now: nowSeconds(), config }));

  const context =
    status === "red"
      ? "TDD state: RED recorded. You may now write the minimal implementation to make this test pass — nothing more."
      : "TDD state: GREEN recorded. Source edits stay open during the refactor window, then lock until a new failing test exists.";
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context } }) + "\n"
  );
  return { exitCode: 0 };
}
