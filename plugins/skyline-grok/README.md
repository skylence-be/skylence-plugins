# skyline-grok

Grok port of the Skylence skyline enforcement plugin.

Wires the skyline HTTP MCP daemon (`http://127.0.0.1:7333/mcp`) into Grok and installs lifecycle hooks. When the daemon is reachable, native Grok file and shell tools are redirected to the richer `skyline_*` MCP tools with an **exact substitute** call in the deny reason. Fails open when the daemon is unreachable.

This is the Grok sibling of `skyline-claude` (v1.5.x), `skyline-codex`, and `skyline-antigravity`.

## What it ships

- `plugin.json` + `mcp_config.json` — registers the `skyline` HTTP MCP server.
- `hooks/hooks.json` + `hooks/skyline-enforce.js` — Grok PreToolUse enforcement (Node; `GROK_PLUGIN_ROOT`; outputs `{"decision":"deny","reason":...}` with exact substitutes, daemon lifecycle pass-through, sub-threshold silence, out-of-tree pass-through, symbol-hunt steers).
- `hooks/steering-detect.js` — shared symbol-hunt detectors (from skyline-claude).
- `hooks/skyline-skylore-deposit.js` — once-per-session Stop gate that asks the agent to deposit disconfirmations into skylore.
- `skills/upgrade/`, `skills/uninstall/`, `skills/update-plugin/` — lifecycle management.
- `scripts/uninstall.sh`, `scripts/upgrade.sh`

## Parity with skyline-claude

| Claude capability | Grok port |
|---|---|
| Smart enforce (exact substitutes, daemon probe, lifecycle allow) | **ported** |
| Symbol-hunt steers on native grep/bash denials | **ported** |
| Stop skylore deposit | **ported** |
| SessionStart primer (abs-path / skylore / skyrift facts) | **not ported** — Grok SessionStart is observe-only (stdout ignored) |
| SessionStart compact re-gate | **not ported** — same |
| PreToolUse soft nudge on `skyline_grep` MCP | **not ported** — Grok PreToolUse only supports allow/deny JSON, not `additionalContext` |
| jobs-monitor | **not ported** — retired even on Claude (session-scoped redesign pending) |

## Install

```bash
grok plugin marketplace add skylence-be/skylence-plugins
grok plugin marketplace update skylence-plugins
grok plugin install skyline-grok@skylence-be/skylence-plugins --trust
```

After install (and `skyline daemon` running), the `skyline_*` tools appear and native operations are steered when the daemon is healthy. **Restart the Grok session** after install/update so hooks reload.

## Notes

- Same fixed port (7333) and daemon as all other host variants.
- Update plugin only: `grok plugin update skyline-grok` (or the `update-plugin` skill).
- Update binary + daemon + plugin: `upgrade` skill / `scripts/upgrade.sh`.
- See the root README for cross-agent install patterns.

The other three Grok plugins (`skybox-grok`, `skycastle-grok`, `skyway-grok`) follow the same overall layout.
