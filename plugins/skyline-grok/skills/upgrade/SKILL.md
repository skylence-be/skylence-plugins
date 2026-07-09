---
name: skyline-upgrade
description: Update/upgrade skyline — installs the latest binary, restarts the daemon, and refreshes the plugin. Use when the user wants to update or upgrade skyline.
---

Run these commands in order using the shell (Grok `run_terminal_command`):

1. `skyline update --yes` — install the latest skyline release from GitHub.
2. `skyline daemon restart --port 7333` — restart the daemon so it runs the new binary (if it fails, run `skyline daemon install --port 7333`).
3. Refresh the Grok plugin:
   - `grok plugin update skyline-grok`
   (or reinstall: `grok plugin install skyline-grok@skylence-plugins --trust`)

Then tell the user to restart their Grok session to load the updated plugin.
