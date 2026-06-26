---
name: upgrade-skill
description: Update/upgrade skyway — installs the latest binary, restarts the daemon, and refreshes the plugin. Use when the user wants to update or upgrade skyway.
---

Run these commands in order using the shell:

1. `skyway update -y` — install the latest skyway release from GitHub.
2. `skyway daemon restart` — restart the daemon so it runs the new binary (if it fails, run `skyway service install` to register and start the autostart service).
3. `codex plugin marketplace upgrade skylence-plugins` — refresh the plugin marketplace snapshot.

Then tell the user to restart their Codex session to load the updated plugin.
