#!/usr/bin/env bash
# PreToolUse gate: a plan artifact must exist, carry >=3 approaches with tradeoffs,
# and be explicitly approved by the human before any build tool runs.
set -uo pipefail

# Fail closed: an enforcement gate that vanishes when a dependency is missing is
# worse than no gate, because you stop noticing it isn't there.
if ! command -v jq >/dev/null 2>&1; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"hatstack gate cannot run: jq is not installed. Install jq, or disable the gate deliberately with HATSTACK_TDD_OFF=1 / plan_gate off in .hatstack/config.json."}}'
  exit 0
fi

PAYLOAD=$(cat)
ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
PLAN_DIR="$ROOT/.hatstack/plans"

allow() { echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'; exit 0; }
deny() {
  jq -nc --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

[ "${HATSTACK_PLAN_GATE_OFF:-}" = "1" ] && allow

# Only gate when a session has been opened under a hat. Ad-hoc work is unaffected.
ACTIVE="$ROOT/.hatstack/active-plan"
[ ! -f "$ACTIVE" ] && allow

PLAN=$(cat "$ACTIVE")
[ ! -f "$PLAN" ] && deny "Plan gate: active plan '$PLAN' is missing. Re-run the hat's plan command."

APPROACHES=$(grep -cE '^## Approach [0-9]' "$PLAN" || true)
if [ "$APPROACHES" -lt 3 ]; then
  deny "Plan gate: '$PLAN' contains $APPROACHES approaches; 3 are required. Each needs its own '## Approach N' section with Pros, Cons, Reversibility and Cost. Do not pad — if you cannot find a genuine third option, say so explicitly in the plan and describe why the space is constrained."
fi

for section in Pros Cons Reversibility; do
  COUNT=$(grep -cE "^\*\*$section:?\*\*|^### $section" "$PLAN" || true)
  if [ "$COUNT" -lt "$APPROACHES" ]; then
    deny "Plan gate: '$PLAN' has $APPROACHES approaches but only $COUNT '$section' blocks. Every approach needs one."
  fi
done

if ! grep -qE '^APPROVED:' "$PLAN"; then
  deny "Plan gate: '$PLAN' has no APPROVED line. Present the approaches to the human with AskUserQuestion, then write 'APPROVED: <approach name> — <date>' into the plan. Do not write this line yourself without an explicit human answer."
fi

allow
