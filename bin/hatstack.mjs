#!/usr/bin/env node
// hatstack CLI. Zero runtime dependencies — Node >= 20 only.
//
//   hatstack check plan|tdd|accept [--file PATH] [--root DIR]
//   hatstack test -- <command...>
//   hatstack review <hat> [--diff REF] [--files GLOB] [--root DIR]
//   hatstack media image|video "<prompt>" [...]
//   hatstack init [--root DIR]
//   hatstack install [--host X] [--copy] [--uninstall] [--home DIR]
//
// Exit codes for `check`: 0 allow, 2 deny, 3 cannot evaluate.
import { spawn } from "node:child_process";
import { loadConfig } from "../lib/config.mjs";
import { checkPlan, checkTdd, checkAccept } from "../lib/gates.mjs";
import { classifyRun, buildState, writeState } from "../lib/state.mjs";

const argv = process.argv.slice(2);

function flag(name, def = undefined) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

function fail(msg, code = 1) {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
  process.exit(code);
}

// ---- check ------------------------------------------------------------------
function cmdCheck() {
  const which = argv[1];
  const root = flag("root", process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const file = flag("file");
  let config;
  try {
    config = loadConfig(root);
  } catch (err) {
    // A broken config must fail closed, not silently open the gate.
    process.stdout.write(err.message + "\n");
    process.exit(3);
  }

  let result;
  if (which === "plan") result = checkPlan({ root, config });
  else if (which === "tdd") result = checkTdd({ root, config, file, now: nowSeconds() });
  else if (which === "accept") result = checkAccept({ root, config, file });
  else fail("usage: hatstack check <plan|tdd|accept> [--file PATH]", 2);

  if (result.reason) process.stdout.write(result.reason + "\n");
  process.exit(result.exitCode);
}

// ---- test -------------------------------------------------------------------
// Run a command, tee its output so a human still sees it, then record RED/GREEN
// from the real exit code. This is the recorder that makes the TDD gate honest.
function cmdTest() {
  const sep = argv.indexOf("--");
  const cmd = sep === -1 ? [] : argv.slice(sep + 1);
  if (cmd.length === 0) fail("usage: hatstack test -- <command...>", 2);
  const root = flag("root", process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const config = loadConfig(root);

  const child = spawn(cmd[0], cmd.slice(1), { shell: false });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => {
    stdout += d;
    process.stdout.write(d);
  });
  child.stderr.on("data", (d) => {
    stderr += d;
    process.stderr.write(d);
  });
  child.on("error", (err) => fail(`hatstack test: could not run '${cmd.join(" ")}': ${err.message}`, 3));
  child.on("close", (code) => {
    const status = classifyRun({ exitCode: code ?? 0, stdout, stderr });
    const state = buildState({ status, command: cmd.join(" "), now: nowSeconds(), config });
    const path = writeState(root, state);
    const banner =
      status === "red"
        ? `\nhatstack: RED recorded (${path}). Source writes are now allowed — implement the minimum to pass.`
        : `\nhatstack: GREEN recorded (${path}). Refactor window open for ${config.refactor_window_seconds}s; then source writes lock until the next failing test.`;
    process.stderr.write(banner + "\n");
    process.exit(code ?? 0);
  });
}

// ---- dispatch ---------------------------------------------------------------
async function main() {
  const command = argv[0];
  switch (command) {
    case "check":
      return cmdCheck();
    case "test":
      return cmdTest();
    case "init": {
      const { init } = await import("../lib/init.mjs");
      return init({ root: flag("root", process.cwd()) });
    }
    case "review": {
      const { runReview } = await import("../lib/review.mjs");
      return runReview({
        hat: argv[1],
        root: flag("root", process.cwd()),
        diff: flag("diff"),
        files: flag("files"),
      });
    }
    case "media": {
      const { runMedia } = await import("../lib/media.mjs");
      return runMedia(argv.slice(1));
    }
    case "install": {
      const { install } = await import("../lib/hosts.mjs");
      return install({
        host: flag("host"),
        copy: flag("copy") === true,
        uninstall: flag("uninstall") === true,
        home: flag("home"),
      });
    }
    case "version":
    case "--version":
    case "-v":
      process.stdout.write("hatstack 0.1.0\n");
      return;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(
        `hatstack — plan / test-first / adversarial-review, portable across harnesses.

  hatstack check <plan|tdd|accept> [--file PATH]   run a gate (exit 0 allow, 2 deny, 3 cannot-eval)
  hatstack test -- <command...>                    run tests, record RED/GREEN
  hatstack review <hat> [--diff REF] [--files G]   dispatch an independent reviewer
  hatstack media <image|video> "<prompt>" [...]    generate assets with a provenance manifest
  hatstack init                                    scaffold .hatstack/ + git pre-commit hook
  hatstack install [--host X] [--copy] [--uninstall]  link hats into installed harnesses
`
      );
      return;
    default:
      fail(`hatstack: unknown command '${command}'. Try 'hatstack help'.`, 2);
  }
}

main().catch((err) => fail(`hatstack: ${err.stack || err.message}`, 1));
