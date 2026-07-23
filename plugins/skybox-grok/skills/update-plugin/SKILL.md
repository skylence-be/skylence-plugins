---
name: update-plugin
description: Update the installed skybox-grok plugin to the latest published version. Refreshes the marketplace clone, installs the new version, verifies it, and prompts a restart. Invoke when the user asks to update or refresh the skybox plugin or its hooks.
---

# Update the skybox-grok plugin

Hooks and MCP wiring load at session start. A published release needs an install + session restart.

## Steps

1. `grok plugin marketplace update skylence-plugins`
2. `grok plugin update skybox-grok`
   (fallback: `grok plugin install skybox-grok@skylence-be/skylence-plugins --trust`)
3. Confirm the version advanced under `~/.grok/installed-plugins/`.
4. Tell the user to **restart the Grok session**.

Does not update the skybox binary/daemon; use the `upgrade` skill for that.
