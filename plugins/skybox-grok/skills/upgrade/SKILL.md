---
name: skybox-upgrade
description: Restart the skybox MCP daemon on the latest binary and refresh the plugin. Use when the user wants to update or upgrade skybox.
---

skybox has no in-place `update` subcommand — update the binary via its release/install, then:

1. Prefer `scripts/upgrade.sh` from the plugin, or:
   `launchctl kickstart -k "gui/$(id -u)/be.skylence.skybox.mcp"`
   (if absent: `skybox mcp serve --transport http --bind 127.0.0.1 --port 7070`)
2. Refresh the plugin: `grok plugin marketplace update skylence-plugins && grok plugin update skybox-grok`
   (or the `update-plugin` skill)

Tell the user to **restart the Grok session**.
