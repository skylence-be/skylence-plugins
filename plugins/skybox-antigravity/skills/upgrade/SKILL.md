---
name: upgrade-skill
description: Restart the skybox MCP daemon on the latest binary and refresh the plugin. Use when the user wants to update or upgrade skybox.
---

skybox has no in-place `update` subcommand — the binary is updated via its own release/install. Restart the launchd-managed daemon, then refresh the plugin.

1. `launchctl kickstart -k "gui/$(id -u)/be.skylence.skybox.mcp"` — restart the skybox MCP daemon (if that launchd unit is absent, ensure it is serving: `skybox mcp serve --transport http --bind 127.0.0.1 --port 7070`).
2. Refresh the Antigravity plugin. There is no `agy plugin upgrade` verb; reinstalling refreshes the plugin from its source:
   - `agy plugin install skybox-antigravity`

Then tell the user to restart their Antigravity session to load the updated plugin.
