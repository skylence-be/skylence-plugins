# skyline-grok

Grok port of the Skylence skyline enforcement plugin.

Wires the skyline HTTP MCP daemon (`http://127.0.0.1:7333/mcp`) into Grok and installs a `PreToolUse` hook. When the daemon is running, native Grok file and shell tools are redirected to the richer `skyline_*` MCP tools. Fails open when the daemon is unreachable.

This is the Grok sibling of `skyline-claude`, `skyline-codex`, and `skyline-antigravity`.

## What it ships

- `plugin.json` + `mcp_config.json` — registers the `skyline` HTTP MCP server.
- `hooks/hooks.json` + `hooks/skyline-enforce.sh` — Grok-native PreToolUse enforcement (uses `GROK_PLUGIN_ROOT` + CLAUDE fallback; outputs `{"decision": ...}`).
- `skills/upgrade/` and `skills/uninstall/` — lifecycle management.
- `scripts/uninstall.sh`

## Install

```bash
grok plugin marketplace add skylence-be/skylence-plugins
grok plugin install skyline-grok@skylence-plugins --trust
```

After install (and `skyline daemon` running), the `skyline_*` tools appear and native operations are steered when the daemon is healthy.

## Notes

- Same fixed port (7333) and daemon as all other host variants.
- Update: `grok plugin update skyline-grok`
- See the root README for cross-agent install patterns and the `operate` / upgrade skills for usage.

The other three Grok plugins (`skybox-grok`, `skycastle-grok`, `skyway-grok`) follow the same pattern (additive or steering as appropriate).
