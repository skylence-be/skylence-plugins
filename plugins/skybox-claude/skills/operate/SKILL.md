---
name: skybox-operate
description: Navigate indexed code graphs through the skybox MCP tools. Use to trace execution flows, analyze change impact, map routes, or query cross-repo code structure. Daemon: http://127.0.0.1:7070.
---

skybox = read-only code-knowledge-graph daemon on 127.0.0.1:7070. MCP server `skybox`. It complements native file tools (it never edits); use it for structure questions grep cannot answer.

PRECHECK: a failing skybox MCP call usually means the daemon is down or the repo is not indexed.
- MCP down → wait and retry; restart with `launchctl kickstart -k gui/$(id -u)/be.skylence.skybox.mcp` (or `skybox mcp serve --transport http --bind 127.0.0.1 --port 7070`). Do not grep-guess code structure while waiting.
- Repo not indexed → index_repo, then poll wait_for_job until complete.
Never fall back to the `skybox` CLI when the MCP is available — the MCP tools are the authoritative path.

INDEX
- index_repo — index a repository (long-running; poll completion with wait_for_job)
- detect_changes — what changed since the last index
- list_repos / repo_status — what is indexed and how fresh

NAVIGATE (indexed repos)
- query — search the code graph (symbols, callers, dependencies); cypher for a raw Cypher query
- context — assemble the code context around a symbol or file
- impact — change-impact analysis: what breaks if this changes
- route_map — map HTTP routes to handlers and their call chains

RULES: answer structure questions from graph output, never assumption. Stale index ⇒ re-index before trusting impact results. Down MCP ⇒ wait + retry, not grep-guessing structure.
