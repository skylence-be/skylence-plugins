---
name: skyway-upgrade
description: Update/upgrade skyway — installs the latest binary, restarts the daemon, and refreshes the plugin. Use when the user wants to update or upgrade skyway.
---

Prefer `scripts/upgrade.sh`, or:

1. `skyway update -y`
2. `skyway daemon restart` (if that fails: `skyway service install`)
3. `grok plugin marketplace update skylence-plugins && grok plugin update skyway-grok`
   (or the `update-plugin` skill)

Tell the user to **restart the Grok session**.
