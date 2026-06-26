# skyway-antigravity

Wires the [skyway](https://github.com/skylence-be) workflow-orchestration MCP
daemon into **Google Antigravity**: one HTTP MCP server that exposes skyway's
run/step inspection, job control, workflow lint + source, cost estimation, and
approval/waiter tools to the agent.

This plugin is the Antigravity sibling of the `skyway` wiring for Claude Code
and Codex. The manifest, MCP config, and skills follow Antigravity's real
plugin format.

## What it does

- Registers a single HTTP MCP server, `skyway`, pointing at the local skyway
  daemon (`http://127.0.0.1:3090/mcp`). That server exposes the `skylence_*`
  tools: run output tail/search, step inspection, job control, the
  waiter/approval flow, run recording, workflow lint + source, lock, whoami,
  and `estimate_workflow_cost`.
- Ships `upgrade` and `uninstall` skills that drive the skyway binary/daemon
  lifecycle.

## Additive, not enforcing

skyway is **additive**: its MCP tools augment Antigravity's native shell, read,
and edit tools — they do not shadow or replace them. This plugin therefore ships
**no** enforcement hook (`hooks.json` / `hooks/`). The agent keeps full use of
the native tools and gains the `skyway` MCP tools on top. (This is the
difference from `skyline-antigravity`, which shadows native tools and so needs a
`PreToolUse` deny hook.)

## The daemon dependency

This plugin does nothing useful on its own — it assumes the skyway daemon is
installed and serving.

- **Daemon endpoint:** `http://127.0.0.1:3090/mcp` (HTTP MCP). Port `3090` is
  the skyway daemon's default listen port.
- **Serve:** `skyway serve` (foreground), or register a background service with
  `skyway service install` (launchd / systemd `--user` / Scheduled Task).
- **Lifecycle:** `skyway daemon {status,stop,restart,kill}`.
- **Update:** `skyway update -y`.

## Install / config layout

Antigravity plugins load from a per-user or per-workspace plugin directory:

- **Global scope:** `~/.gemini/antigravity-cli/plugins/<name>/`.
- **Workspace scope:** `<project-root>/.agents/plugins/<name>/`.

The plugin marker (`plugin.json`) and MCP config (`mcp_config.json`) live at the
**plugin root**. Skills live in `skills/<name>/SKILL.md`.

Install via the CLI or the IDE:

- **CLI:** `agy plugin install skyway-antigravity` (or
  `agy plugin import <source>`). Other verbs: `agy plugin uninstall <name>`,
  `agy plugin enable|disable|validate|list`. There is **no** `agy plugin
  upgrade` verb — reinstall to refresh.
- **IDE:** `/plugin install`.

## File tree

```
plugins/skyway-antigravity/
├── plugin.json              # plugin manifest / marker (mcpServers -> ./mcp_config.json)
├── mcp_config.json          # HTTP MCP server "skyway" -> 127.0.0.1:3090/mcp
├── scripts/
│   └── uninstall.sh         # bundled full-uninstall flow
├── skills/
│   ├── upgrade/SKILL.md
│   └── uninstall/SKILL.md
└── README.md
```
