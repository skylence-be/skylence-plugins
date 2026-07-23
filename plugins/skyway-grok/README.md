# skyway-grok

Grok port of the Skylence skyway workflow plugin.

Wires the skyway HTTP MCP daemon (port 3090) into Grok for workflow inspection, control, linting, cost estimation, and approval flows. Purely additive — no native tool shadowing (matches skyway-claude).

Sibling of `skyway-claude` (v1.1.3).

## What it ships

- `plugin.json` + `mcp_config.json` — `skyway` HTTP MCP server.
- `skills/operate/`, `skills/skyway-status/`, `skills/upgrade/`, `skills/update-plugin/`, `skills/uninstall/`
- `scripts/upgrade.sh`, `scripts/uninstall.sh`
- No enforcement hooks (additive product).

## Parity with skyway-claude

| Capability | Status |
|---|---|
| MCP wiring | present |
| operate skill | present |
| status skill | **ported** (as skill; Claude uses a command) |
| upgrade.sh (binary update + daemon restart) | **ported** |
| update-plugin skill | **ported** |

## Install

```bash
grok plugin marketplace add skylence-be/skylence-plugins
grok plugin marketplace update skylence-plugins
grok plugin install skyway-grok@skylence-be/skylence-plugins --trust
```

**Restart the Grok session** after install/update.
