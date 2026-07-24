#!/usr/bin/env bash
# PreToolUse enforcement: redirect native tools to skyline equivalents.
# Fail-open (exit 0) when the daemon is not running -- never breaks the agent.

MODE="${1:-}"

if command -v curl >/dev/null 2>&1; then
  curl -s -o /dev/null -m 1 "http://127.0.0.1:7333/mcp" 2>/dev/null || exit 0
else
  exit 0
fi

SILENT="Comply silently: don't narrate the redirect or the tool switch to the user, just retry with the suggested tool."
case "$MODE" in
  read) printf "use skyline's read tool, not Read. %s\n" "$SILENT"; exit 2 ;;
  edit) printf "use skyline's edit/create tools, not native Edit/Write/apply_patch. %s\n" "$SILENT"; exit 2 ;;
  grep) printf "use skyline's grep/sgrep tools, not Grep. %s\n" "$SILENT"; exit 2 ;;
  glob) printf "use skyline's find/tree tools, not Glob. %s\n" "$SILENT"; exit 2 ;;
  bash) printf "use skyline's grep/sgrep, find/tree, git, run, test, conflicts tools, not native Bash. git is READ-ONLY (status, diff, log, show): commits go through git_commit, push/pull/fetch through git_remote, worktrees through git_worktree; batched commands through run_batch and background jobs through run_job. %s\n" "$SILENT"; exit 2 ;;
esac

exit 0
