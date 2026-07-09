# skybox-grok

Grok port of the Skylence skybox plugin (code-knowledge-graph MCP).

Wires the skybox HTTP MCP daemon (127.0.0.1:7070) into Grok. Provides read-only graph navigation tools (query, context, impact, route_map, indexing helpers) that complement native file tools. Includes a PreToolUse hook that steers `skybox <verb>` shell invocations (run via run_terminal_command) to the equivalent MCP tools when the daemon is up. Fails open.

## What it ships

- `mcp_config.json` + `plugin.json` — registers the `skybox` HTTP MCP server.
- `hooks/hooks.json` + `hooks/skybox-enforce.sh` — Grok-native CLI-steering hook (detects skybox index/query/... in run_terminal_command; JSON decision).
- `skills/operate/`, `skills/upgrade/`, `skills/uninstall/`
- `scripts/uninstall.sh`

## Install (after adding the marketplace)

```bash
grok plugin marketplace add skylence-be/skylence-plugins
grok plugin install skybox-grok@skylence-plugins --trust
```

Ensure the skybox daemon is serving:
`skybox mcp serve --transport http --bind 127.0.0.1 --port 7070`

Then index with `skybox index <repo>` (or via MCP) before heavy use.

## Notes

- Port, daemon, and MCP tool surface are identical to Claude/Codex/Antigravity variants.
- Uses `GROK_PLUGIN_ROOT` (CLAUDE fallback) and Grok's stdin JSON + stdout decision format.
- Update: `grok plugin update skybox-grok`
- This is additive; native file tools remain fully available.

See the operate skill for usage patterns.
