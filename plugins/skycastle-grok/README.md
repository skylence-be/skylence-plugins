# skycastle-grok

Grok port of the Skylence skycastle plugin.

Wires the skycastle secrets-manager MCP daemon (`127.0.0.1:8210`) into Grok. Secret CRUD, KMS, certs, SSH, scanning, PAM, AI, tokens via MCP. PreToolUse steers `skycastle secrets` / `skycastle export` to MCP when the daemon is up (fail-open). Additive.

Sibling of `skycastle-claude` (v1.0.3+).

## What it ships

- `mcp_config.json` + `plugin.json` — `skycastle` HTTP MCP server.
- `hooks/skycastle-enforce.js` — structural CLI→MCP steer for secrets/export (+ `skyline_run` argv), Grok decision JSON.
- `skills/operate/`, `skills/skycastle-status/`, `skills/upgrade/`, `skills/update-plugin/`, `skills/uninstall/`
- `scripts/upgrade.sh`, `scripts/uninstall.sh`

## Parity with skycastle-claude

| Capability | Status |
|---|---|
| Structural enforce (argv + shell) | **ported** |
| Fail-open when :8210 down | **ported** |
| skyline_run matcher | **ported** |
| status skill | **ported** (as skill; Claude uses a command) |
| upgrade.sh + update-plugin | **ported** |

## Install

```bash
grok plugin marketplace add skylence-be/skylence-plugins
grok plugin marketplace update skylence-plugins
grok plugin install skycastle-grok@skylence-be/skylence-plugins --trust
```

**Restart the Grok session** after install/update. Vault is on :8200; MCP on :8210.
