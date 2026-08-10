#!/usr/bin/env bash
# PostToolUse on Bash: watch for test-runner invocations and record RED/GREEN.
# This is what makes the TDD gate automatic instead of ceremonial — the agent
# cannot claim a test failed, it has to actually run one.
set -uo pipefail

command -v jq >/dev/null 2>&1 || { echo "hatstack: jq missing, TDD state not recorded" >&2; exit 0; }

PAYLOAD=$(cat)
CMD=$(jq -r '.tool_input.command // empty' <<<"$PAYLOAD")
[ -z "$CMD" ] && exit 0

# Does this look like a test run? Configurable per project.
CONFIG="${CLAUDE_PROJECT_DIR:-$PWD}/.hatstack/config.json"
PATTERN=$(jq -r '.test_command_pattern // empty' "$CONFIG" 2>/dev/null)
[ -z "$PATTERN" ] && PATTERN='(vitest|jest|pytest|cargo test|go test|npm (run )?test|pnpm (run )?test|bun test|yarn test|rspec|phpunit|cypress run|playwright test)'

echo "$CMD" | grep -Eq "$PATTERN" || exit 0

# Claude Code reports the tool result; a non-zero exit or failure text means RED.
OUT=$(jq -r '.tool_response.stdout // ""' <<<"$PAYLOAD")
ERR=$(jq -r '.tool_response.stderr // ""' <<<"$PAYLOAD")
CODE=$(jq -r '.tool_response.returncode // .tool_response.exit_code // 0' <<<"$PAYLOAD")

if [ "$CODE" -ne 0 ] || echo "$OUT$ERR" | grep -Eqi '([1-9][0-9]* (failed|failing))|FAIL '; then
  STATUS=red
else
  STATUS=green
fi

STATE_DIR="${CLAUDE_PROJECT_DIR:-$PWD}/.hatstack"
mkdir -p "$STATE_DIR"
jq -nc --arg s "$STATUS" --arg c "$CMD" --argjson t "$(date +%s)" \
  '{status:$s, command:$c, ts:$t}' > "$STATE_DIR/tdd-state.json"

# Surface the transition so the agent knows where it stands in the cycle.
if [ "$STATUS" = "red" ]; then
  jq -nc '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:"TDD state: RED recorded. You may now write the minimal implementation to make this test pass — nothing more."}}'
else
  jq -nc '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:"TDD state: GREEN recorded. Source edits are now blocked until a new failing test exists. Refactor under green, or write the next failing test."}}'
fi
