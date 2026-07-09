#!/usr/bin/env sh
# PreToolUse enforcement for Grok.
# Contract: Grok sends JSON on STDIN (with toolName/toolInput); this script PRINTS
# a JSON object on STDOUT with a "decision" of "allow" / "deny".
#
# Behaviour:
#   - FAIL OPEN: if the skyline daemon is unreachable, or curl is missing,
#     print {"decision":"allow"} and exit 0 so the native tool proceeds and the
#     agent is never blocked.
#   - If the daemon IS up, print {"decision":"deny","reason":"..."} steering the
#     agent to the skyline_* MCP tools instead of the native tool.
#
# POSIX sh. The first argument selects the redirect message (read/edit/grep/
# glob/bash); the STDIN payload is drained for contract compliance but the mode
# arg is what we key off.
#
# Grok matchers: run_terminal_command|Bash, read_file|Read, search_replace|...,
# grep|Grep, list_dir|Glob

MODE="${1:-}"

# Drain the tool-call JSON from STDIN (contract: STDIN carries the pending call).
# We do not currently parse it for mode; the hook matcher already tells us via $1.
STDIN_PAYLOAD="$(cat 2>/dev/null || true)"
: "${STDIN_PAYLOAD}"

allow() {
  printf '{"decision":"allow"}\n'
  exit 0
}

deny() {
  # $1 is a JSON-safe reason string (no embedded double quotes / backslashes).
  printf '{"decision":"deny","reason":"%s"}\n' "$1"
  exit 0
}

# The skyline-grok plugin is active (this hook is registered and loaded).
# Enforce redirection to skyline_* MCP tools for matched native operations.
#
# We removed the previous reachability probe (curl check) because it was
# unreliable when executed from inside the hook runner (different process
# env, timing, network view, etc.). It frequently fell through to "allow"
# even when the daemon was healthy and connected.
#
# Presence of this hook = enforce the switch. If the skyline MCP tools
# are not actually available in the session, the model will surface errors
# on skyline calls and can adjust.

# Enforce for known modes.
case "$MODE" in
  read) deny "skyline is active: use the skyline_read MCP tool instead of the native read_file tool." ;;
  edit) deny "skyline is active: use the skyline_edit / skyline_create MCP tools instead of the native search_replace (or Write/Edit) tools." ;;
  grep) deny "skyline is active: use the skyline_grep / skyline_sgrep MCP tools instead of the native grep tool." ;;
  glob) deny "skyline is active: use the skyline_find / skyline_tree MCP tools instead of the native list_dir / glob tool." ;;
  bash) deny "skyline is active: use skyline_grep, skyline_find, skyline_tree, skyline_git, skyline_run, skyline_test instead of run_terminal_command for file/repo work." ;;
esac

# Unknown mode: do not block.
allow
