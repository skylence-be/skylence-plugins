# skycastle-grok

Grok port of the Skylence skycastle plugin.

Wires the skycastle secrets-manager MCP daemon (HTTP on 127.0.0.1:8210) into Grok. Exposes full secret CRUD, KMS, certs, SSH, scanning, PAM, AI, token tools via MCP. Includes a PreToolUse hook that steers `skycastle secrets` / `skycastle export` shell commands to the MCP equivalents when the daemon is up. Additive (does not shadow native file tools).

## What it ships

- `mcp_config.json` + `plugin.json` — registers the `skycastle` HTTP MCP server.
- `hooks/hooks.json` + `hooks/skycastle-enforce.sh` — Grok-native steering hook for CLI subcommands (run_terminal_command).
- `skills/operate/`, `skills/upgrade/`, `skills/uninstall/`
- `scripts/uninstall.sh`

## Install (after adding the marketplace)

```bash
grok plugin marketplace add skylence-be/skylence-plugins
grok plugin marketplace update skylence-plugins
grok plugin install skycastle-grok@skylence-be/skylence-plugins --trust
```

The skycastle MCP tools are then available alongside (and preferred over) the matching CLI verbs.

## Notes

- Daemon on :8210, vault on :8200 (same as other host plugins).
- Hook uses GROK_PLUGIN_ROOT / CLAUDE fallback and Grok JSON decision contract.
- Update via `grok plugin update skycastle-grok`.
- The plugin itself does not manage the skycastle binary/daemon/vault — use `skycastle` CLI for that.

See operate skill for the full tool list and rules.
