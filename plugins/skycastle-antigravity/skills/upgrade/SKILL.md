---
name: upgrade-skill
description: Restart the skycastle MCP daemon and refresh the plugin. Use when the user wants to update skycastle or the plugin.
---

Run these commands in order using the shell (Antigravity `run_command`):

1. Restart the MCP daemon so it picks up any freshly installed binary:
   `launchctl kickstart -k "gui/$(id -u)/be.skylence.skycastle.mcp"`
   If the launchd agent is not found, start the daemon directly:
   `~/.local/bin/skycastle-mcp-http-svc` (or `skycastle mcp http --addr 127.0.0.1:8210`)
2. Refresh the Antigravity plugin. There is no `agy plugin upgrade` verb;
   reinstalling refreshes the plugin from its source:
   - `agy plugin install skycastle-antigravity`

Then tell the user to restart their Antigravity session to load the updated plugin.
