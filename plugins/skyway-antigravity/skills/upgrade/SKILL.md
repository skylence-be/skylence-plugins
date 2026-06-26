---
name: upgrade-skill
description: Update/upgrade skyway — installs the latest binary, restarts the daemon, and refreshes the plugin. Use when the user wants to update or upgrade skyway.
---

Run these commands in order using the shell (Antigravity `run_command`):

1. `skyway update -y` — install the latest skyway release from GitHub. When skyway runs as the launchd/systemd background service, `skyway update` restarts it so the new binary is live.
2. `skyway daemon restart` — restart the daemon to be sure it runs the new binary (if no service is registered, start it with `skyway serve`, or register one with `skyway service install`).
3. Refresh the Antigravity plugin. There is no `agy plugin upgrade` verb;
   reinstalling refreshes the plugin from its source:
   - `agy plugin install skyway-antigravity`

Then tell the user to restart their Antigravity session to load the updated plugin.
