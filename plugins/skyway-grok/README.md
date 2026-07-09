# skyway-grok

Grok port of the Skylence skyway workflow plugin.

Wires the skyway HTTP MCP daemon (port 3090) into Grok for workflow inspection, control, linting, cost estimation, and approval flows. Purely additive — it does not shadow native file or shell tools.

This is the Grok sibling of `skyway-claude`, `skyway-codex`, and `skyway-antigravity`.

## What it ships

- `plugin.json` + `mcp_config.json` — registers the `skyway` HTTP MCP server.
- `skills/operate/`, `skills/upgrade/`, `skills/uninstall/`
- `scripts/uninstall.sh`
- (No enforcement hooks — matches the additive nature of the other skyway ports.)

## Install

```bash
grok plugin marketplace add skylence-be/skylence-plugins
grok plugin install skyway-grok@skylence-plugins --trust
```

## Notes

- Same daemon port (3090) as siblings.
- Uses `GROK_PLUGIN_ROOT` (CLAUDE fallback).
- Update via `grok plugin update skyway-grok`.
- See the `operate` skill for detailed usage.

The other Grok ports (`skyline-grok`, `skybox-grok`, `skycastle-grok`) follow the same overall layout.
