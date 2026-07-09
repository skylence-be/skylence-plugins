#!/usr/bin/env sh
# PreToolUse enforcement for Grok (skycastle CLI -> MCP tools).
# Steers `skycastle secrets ...` and `skycastle export` (when issued via
# run_terminal_command) to the skycastle MCP tools.
#
# Contract: prints {"decision":"allow"} or {"decision":"deny","reason":...}
# Fail-open if daemon down or no match or no curl/jq.
#
# Only secrets/export are redirected; ops verbs pass.

PAYLOAD="$(cat 2>/dev/null || true)"

allow() { printf '{"decision":"allow"}\n'; exit 0; }
deny() { printf '{"decision":"deny","reason":"%s"}\n' "$1"; exit 0; }

command -v curl >/dev/null 2>&1 || allow

# Fail open if daemon not up (MCP tools unavailable => CLI is the path)
curl -s -o /dev/null -m 1 "http://127.0.0.1:8210/mcp" 2>/dev/null || allow

# Extract command string (Grok toolInput.command for run_terminal_command)
CMD=""
if command -v jq >/dev/null 2>&1; then
  CMD=$(printf '%s' "$PAYLOAD" | jq -r '
    (.toolInput.command // .toolInput.cmd // .toolInput // .command // empty) | select(. != null)
  ' 2>/dev/null || true)
fi
[ -z "$CMD" ] && CMD="$PAYLOAD"

# Detect skycastle secrets or export at command position.
if printf '%s' "$CMD" | grep -Eq '(^|[^A-Za-z0-9_])skycastle[^A-Za-z0-9_]+(secrets|export)([^A-Za-z0-9_]|$)'; then
  deny "Use the skycastle MCP tools, not the \`skycastle secrets\` / \`skycastle export\` CLI — the CLI bypasses the vault MCP tools. For secrets, use secret_get / secret_set / secret_list / secret_delete (and versions/tags). If MCP tools not loaded, search for skycastle MCP tools then retry."
fi

allow
