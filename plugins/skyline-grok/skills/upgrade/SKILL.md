---
name: skyline-upgrade
description: Update/upgrade skyline — installs the latest binary, restarts the daemon, and refreshes the plugin. Use when the user wants to update or upgrade skyline.
---

Run these steps in order (via `skyline_run` / shell):

1. Prefer the plugin script when present:
   ```
   sh "${GROK_PLUGIN_ROOT:-$HOME}/.../skyline-grok/scripts/upgrade.sh"
   ```
   Or manually:
   - If `skyline update --check` says managed by npm: `npm i -g @skylence-ai/skyline@latest`
   - Else: `skyline update --yes`
2. `skyline daemon restart --port 7333` (if it fails: `skyline daemon install --port 7333`).
3. Refresh the Grok plugin:
   - `grok plugin marketplace update skylence-plugins`
   - `grok plugin update skyline-grok`
   - (or reinstall: `grok plugin install skyline-grok@skylence-be/skylence-plugins --trust`)

Then tell the user to restart their Grok session to load the updated plugin hooks.
