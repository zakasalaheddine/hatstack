#!/usr/bin/env bash
# Claude Code PreToolUse (Write|Edit|MultiEdit): run the hatstack gates and map
# the result to a permission decision. All logic lives in the Node CLI — this
# wrapper only routes stdin to it, so there is no jq and no gate reimplementation.
set -uo pipefail

if command -v hatstack >/dev/null 2>&1; then
  HATSTACK=(hatstack)
else
  HATSTACK=(node "${CLAUDE_PLUGIN_ROOT}/bin/hatstack.mjs")
fi

"${HATSTACK[@]}" hook claude-pre-write
