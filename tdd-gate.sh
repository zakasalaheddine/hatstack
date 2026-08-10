#!/usr/bin/env bash
# PreToolUse gate: refuse Write/Edit on source files unless a failing test is on record.
# Reads hook payload on stdin, emits a permission decision on stdout.
set -uo pipefail

# Fail closed: an enforcement gate that vanishes when a dependency is missing is
# worse than no gate, because you stop noticing it isn't there.
if ! command -v jq >/dev/null 2>&1; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"hatstack gate cannot run: jq is not installed. Install jq, or disable the gate deliberately with HATSTACK_TDD_OFF=1 / plan_gate off in .hatstack/config.json."}}'
  exit 0
fi

PAYLOAD=$(cat)
STATE_DIR="${CLAUDE_PROJECT_DIR:-$PWD}/.hatstack"
STATE_FILE="$STATE_DIR/tdd-state.json"
CONFIG="${CLAUDE_PROJECT_DIR:-$PWD}/.hatstack/config.json"

allow() { echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'; exit 0; }
deny() {
  jq -nc --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

# --- escape hatches -----------------------------------------------------------
[ "${HATSTACK_TDD_OFF:-}" = "1" ] && allow
[ -f "$CONFIG" ] && [ "$(jq -r '.tdd_gate // "on"' "$CONFIG" 2>/dev/null)" = "off" ] && allow

FILE=$(jq -r '.tool_input.file_path // .tool_input.path // empty' <<<"$PAYLOAD")
[ -z "$FILE" ] && allow

# --- classify the path --------------------------------------------------------
# Tests, fixtures and non-code artifacts are always writable: you must be able to
# write the failing test before the gate has anything to check.
case "$FILE" in
  *test*|*spec*|*__tests__*|*.test.*|*.spec.*|*cypress*|*e2e*|*fixtures*) allow ;;
  *.md|*.mdx|*.txt|*.json|*.yml|*.yaml|*.toml|*.lock|*.env*|*.gitignore) allow ;;
  */.hatstack/*|*/docs/*|*/plans/*) allow ;;
esac

# Only guard paths the project actually calls source.
SRC_GLOBS=$(jq -r '.src_globs // ["src/","app/","lib/","packages/","components/"] | join(" ")' "$CONFIG" 2>/dev/null \
  || echo "src/ app/ lib/ packages/ components/")
GUARDED=0
for g in $SRC_GLOBS; do case "$FILE" in *"$g"*) GUARDED=1 ;; esac; done
[ "$GUARDED" -eq 0 ] && allow

# --- the gate itself ----------------------------------------------------------
if [ ! -f "$STATE_FILE" ]; then
  deny "TDD gate: no test run on record. Write a failing test for this change, run the suite, and let it fail. The RED state is recorded automatically from the test command's exit code. To edit non-source files instead, or to disable the gate for this repo, set tdd_gate:\"off\" in .hatstack/config.json."
fi

STATUS=$(jq -r '.status // "unknown"' "$STATE_FILE")
TS=$(jq -r '.ts // 0' "$STATE_FILE")
AGE=$(( $(date +%s) - TS ))
MAX_AGE=$(jq -r '.tdd_state_max_age_seconds // 1800' "$CONFIG" 2>/dev/null || echo 1800)

if [ "$STATUS" != "red" ]; then
  deny "TDD gate: last recorded test run was '$STATUS', not 'red'. You are about to write implementation code with no failing test proving it is needed. Write the test first, watch it fail, then come back. (file: $FILE)"
fi

if [ "$AGE" -gt "$MAX_AGE" ]; then
  deny "TDD gate: the RED state is ${AGE}s old (max ${MAX_AGE}s) and may not reflect the current tree. Re-run the test suite to refresh it."
fi

allow
