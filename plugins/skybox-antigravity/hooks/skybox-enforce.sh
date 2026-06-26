#!/usr/bin/env sh
# PreToolUse enforcement for Google Antigravity (skybox CLI -> MCP tools).
# Contract: a JSON tool-call object arrives on STDIN; this script PRINTS a JSON
# object on STDOUT with a "decision" of "allow" / "deny".
#
# Behaviour:
#   - FAIL OPEN: if the skybox daemon (7070) is unreachable, or curl is missing,
#     print {"decision":"allow"} so the native tool proceeds (the skybox CLI
#     works without the MCP daemon, so blocking it then would strand the agent).
#   - If the daemon IS up AND the run_command invokes a `skybox` CLI subcommand
#     that has a richer MCP equivalent, print {"decision":"deny",...} steering
#     the agent to the MCP tool.
#
# POSIX sh. Detection greps the drained STDIN payload for a `skybox <verb>`
# invocation; this is coarse (a literal text-search for the same string could
# match) — acceptable because the deny message is informative and the agent can
# re-issue. Ops verbs (mcp/doctor/install/...) are not matched.

PAYLOAD="$(cat 2>/dev/null || true)"

allow() { printf '{"decision":"allow"}\n'; exit 0; }
deny() { printf '{"decision":"deny","reason":"%s"}\n' "$1"; exit 0; }

# Fail open unless we can confirm the skybox daemon is up.
if command -v curl >/dev/null 2>&1; then
  curl -s -o /dev/null -m 1 "http://127.0.0.1:7070/mcp" 2>/dev/null || allow
else
  allow
fi

# Detect a `skybox <verb>` invocation with an MCP equivalent.
if printf '%s' "$PAYLOAD" | grep -Eq 'skybox[^A-Za-z0-9_]+(index|query|search|status|list|affected|augment)([^A-Za-z0-9_]|$)'; then
  deny "Use the skybox MCP tools, not the skybox CLI: skybox index -> the index_repo MCP tool (poll with wait_for_job); query/search -> query; status/list -> list_repos/repo_status; affected -> detect_changes/impact. The CLI bypasses the indexed code-graph tools."
fi

allow
