#!/usr/bin/env bash
# Stop hook: snapshot the project's current working state so the NEXT session
# can pick it up. Overwrites rather than appends — Stop fires after every
# assistant turn, so an append-only log would grow without bound. The file is
# always "state as of now", never a transcript.
set -u
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
mkdir -p .claude

BRANCH=$(git branch --show-current 2>/dev/null)
UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo "none")
AHEAD=$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo "?")
DIRTY=$(git status --porcelain 2>/dev/null | head -20)

{
  echo "# Session state (auto-recorded)"
  echo
  echo "_Snapshot written by the Stop hook at $(date -u '+%Y-%m-%d %H:%M UTC'). Reflects"
  echo "the repo as of the end of the last session, not a conversation transcript._"
  echo
  echo "- Branch: \`${BRANCH}\` (upstream: \`${UPSTREAM}\`, unpushed commits: ${AHEAD})"
  echo
  echo "## Recent commits"
  echo '```'
  git log --oneline -10 2>/dev/null
  echo '```'
  echo
  if [ -n "$DIRTY" ]; then
    echo "## Uncommitted changes"
    echo '```'
    echo "$DIRTY"
    echo '```'
  else
    echo "## Uncommitted changes"
    echo
    echo "None — working tree clean."
  fi
} > .claude/session-state.md 2>/dev/null

exit 0
