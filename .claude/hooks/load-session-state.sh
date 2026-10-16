#!/usr/bin/env bash
# SessionStart hook: inject the snapshot recorded by the Stop hook straight
# into the new session's context. This is the half that actually delivers
# continuity — CLAUDE.md is loaded automatically, but a separate file is not,
# so without this the snapshot would just sit on disk unread.
#
# Uses node rather than jq for JSON escaping: jq is not installed on this
# machine, node always is in a Next.js project.
set -u
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -f .claude/session-state.md ] || exit 0

node -e '
  const fs = require("fs");
  try {
    const ctx = fs.readFileSync(".claude/session-state.md", "utf8").trim();
    if (!ctx) process.exit(0);
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext:
          "State carried over from the previous session in this repo:\n\n" + ctx,
      },
    }));
  } catch { process.exit(0); }
' 2>/dev/null

exit 0
