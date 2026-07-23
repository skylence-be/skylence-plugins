# skybox-grok

Grok port of the Skylence skybox plugin (code-knowledge-graph MCP).

Wires the skybox HTTP MCP daemon (`127.0.0.1:7070`) into Grok. Read-only graph navigation (query, context, impact, route_map, indexing helpers). PreToolUse steering redirects `skybox` / `sky-graph` CLI verbs with MCP equivalents when the daemon is up (fail-open when not).

Sibling of `skybox-claude` (v1.1.2+).

## What it ships

- `mcp_config.json` + `plugin.json` — `skybox` HTTP MCP server.
- `hooks/skybox-enforce.js` — structural CLI→MCP steer (command-position shell + argv for `skyline_run`), Grok decision JSON.
- `skills/operate/`, `skills/upgrade/`, `skills/update-plugin/`, `skills/uninstall/`
- `scripts/upgrade.sh`, `scripts/uninstall.sh`

## Parity with skybox-claude

| Capability | Status |
|---|---|
| Structural enforce (argv + shell, not raw grep) | **ported** |
| Fail-open when :7070 down | **ported** |
| Also fire on `skyline_run` (when skyline-grok redirects bash) | **ported** |
| upgrade.sh + update-plugin skill | **ported** |

## Install

```bash
grok plugin marketplace add skylence-be/skylence-plugins
grok plugin marketplace update skylence-plugins
grok plugin install skybox-grok@skylence-be/skylence-plugins --trust
```

Ensure the daemon: `skybox mcp serve --transport http --bind 127.0.0.1 --port 7070`

**Restart the Grok session** after install/update.
