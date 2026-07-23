---
name: skycastle-upgrade
description: Restart the skycastle MCP daemon and refresh the plugin. Use when the user wants to update skycastle or the plugin.
---

1. Prefer `scripts/upgrade.sh`, or:
   `launchctl kickstart -k "gui/$(id -u)/be.skylence.skycastle.mcp"`
   (if absent: `~/.local/bin/skycastle-mcp-http-svc` or `skycastle mcp http --addr 127.0.0.1:8210`)
2. Refresh: `grok plugin marketplace update skylence-plugins && grok plugin update skycastle-grok`
   (or the `update-plugin` skill)

Tell the user to **restart the Grok session**.
