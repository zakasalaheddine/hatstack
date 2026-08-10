#!/usr/bin/env bash
# Claude Code PostToolUse (Bash): if the command was a test run, record RED/GREEN
# from its real exit code. This is what makes the TDD gate automatic rather than
# ceremonial — the agent cannot claim a test failed, it has to actually run one.
set -uo pipefail

if command -v hatstack >/dev/null 2>&1; then
  HATSTACK=(hatstack)
else
  HATSTACK=(node "${CLAUDE_PLUGIN_ROOT}/bin/hatstack.mjs")
fi

"${HATSTACK[@]}" hook claude-post-bash
