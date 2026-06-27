# skycastle-antigravity

Wires the [skycastle](https://github.com/skylence-be) secrets-manager MCP
daemon into **Google Antigravity**: one HTTP MCP server that exposes skycastle's
secret CRUD, KMS, certificates, SSH, secret-scanning, PAM, AI, and token tools
to the agent.

This plugin is the Antigravity sibling of the `skycastle` wiring for Claude Code
and Codex. The manifest, MCP config, and skills follow Antigravity's real
plugin format.

## What it does

- Registers a single HTTP MCP server, `skycastle`, pointing at the local
  skycastle MCP daemon (`http://127.0.0.1:8210/mcp`). The vault server runs on
  :8200 (can be sealed); the MCP proxy runs on :8210 and is managed by the
  `be.skylence.skycastle.mcp` launchd agent.
- Ships `upgrade` and `uninstall` skills that drive the skycastle daemon
  lifecycle.

## Additive, not enforcing

skycastle is **additive**: its MCP tools augment Antigravity's native shell,
read, and edit tools — they do not shadow or replace them. This plugin therefore
ships **no** enforcement hook. The agent keeps full use of native tools and gains
the `skycastle` MCP tools on top.

## The daemon dependency

This plugin does nothing useful on its own — it assumes the skycastle MCP daemon
is installed and serving.

- **Daemon endpoint:** `http://127.0.0.1:8210/mcp` (HTTP MCP). Port `8210` is
  the skycastle MCP daemon's listen port.
- **Serve:** `~/.local/bin/skycastle-mcp-http-svc` (sets `SKYCASTLE_ADDR` +
  `SKYCASTLE_TOKEN` then runs `skycastle mcp http --addr 127.0.0.1:8210`).
- **Restart:** `launchctl kickstart -k gui/$(id -u)/be.skylence.skycastle.mcp`
- **Vault server:** `be.skylence.skycastle.server` on :8200. If sealed, secret
  reads return 503 — run `skycastle unseal` before any secret operation.

## Install / config layout

Antigravity plugins load from a per-user or per-workspace plugin directory:

- **Global scope:** `~/.gemini/antigravity-cli/plugins/<name>/`.
- **Workspace scope:** `<project-root>/.agents/plugins/<name>/`.

The plugin marker (`plugin.json`) and MCP config (`mcp_config.json`) live at the
**plugin root**. Skills live in `skills/<name>/SKILL.md`.

Install via the CLI or the IDE:

- **CLI:** `agy plugin install skycastle-antigravity` (or
  `agy plugin import <source>`). Other verbs: `agy plugin uninstall <name>`,
  `agy plugin enable|disable|validate|list`. There is **no** `agy plugin
  upgrade` verb — reinstall to refresh.
- **IDE:** `/plugin install`.

## File tree

```
plugins/skycastle-antigravity/
├── plugin.json              # plugin manifest / marker (mcpServers -> ./mcp_config.json)
├── mcp_config.json          # HTTP MCP server "skycastle" -> 127.0.0.1:8210/mcp
├── scripts/
│   └── uninstall.sh         # bundled full-uninstall flow
├── skills/
│   ├── operate/SKILL.md
│   ├── upgrade/SKILL.md
│   └── uninstall/SKILL.md
└── README.md
```
