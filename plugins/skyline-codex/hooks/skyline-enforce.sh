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
  read) printf "use skyline_read, not Read.\n"; exit 2 ;;
  edit) printf "use skyline_edit/skyline_create, not Edit/Write.\n"; exit 2 ;;
  grep) printf "use skyline_grep/skyline_sgrep, not Grep.\n"; exit 2 ;;
  glob) printf "use skyline_find/skyline_tree, not Glob.\n"; exit 2 ;;
  bash) printf "use skyline_grep/skyline_sgrep, skyline_find/skyline_tree, skyline_git (read-only: status/diff/log/show/worktree-list), skyline_git_commit/skyline_git_remote/skyline_git_worktree for git writes, skyline_run/skyline_run_batch/skyline_run_job, skyline_test, skyline_conflicts -- not Bash.\n"; exit 2 ;;
esac

exit 0
