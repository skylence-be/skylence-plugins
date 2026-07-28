#!/usr/bin/env bash
# PreToolUse enforcement: redirect native tools to skyline equivalents.
# Fail-open (exit 0) when the daemon is not running — never breaks the agent.

MODE="${1:-}"

if command -v curl >/dev/null 2>&1; then
  # any response (incl. 4xx) means up
  curl -4 --silent --connect-timeout 2 --max-time 3 -o /dev/null -I "http://127.0.0.1:7333/mcp" 2>/dev/null || exit 0
else
  exit 0
fi

case "$MODE" in
  read) printf "use read, not Read.\n"; exit 2 ;;
  edit) printf "use edit/create, not Edit/Write.\n"; exit 2 ;;
  grep) printf "use grep/sgrep, not Grep.\n"; exit 2 ;;
  glob) printf "use find/tree, not Glob.\n"; exit 2 ;;
  bash) printf "use grep/sgrep, find/tree, git (read-only: status/diff/log/show/worktree-list), git_commit/git_remote/git_worktree for git writes, run/run_batch/run_job, test, conflicts -- not Bash.\n"; exit 2 ;;
esac

exit 0
