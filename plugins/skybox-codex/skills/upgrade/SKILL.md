---
name: upgrade-skill
description: Restart the skybox MCP daemon on the latest binary and refresh the plugin. Use when the user wants to update or upgrade skybox.
---

skybox has no in-place `update` subcommand — the binary is updated via its own release/install. Restart the launchd-managed daemon so it picks up the latest binary, then refresh the plugin:

1. `launchctl kickstart -k "gui/$(id -u)/be.skylence.skybox.mcp"` — restart the skybox MCP daemon (if that launchd unit is absent, ensure it is serving: `skybox mcp serve --transport http --bind 127.0.0.1 --port 7070`).
2. `codex plugin marketplace upgrade skylence-plugins` — refresh the plugin marketplace snapshot.

Then tell the user to restart their Codex session to load the updated plugin.
