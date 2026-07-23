---
name: update-plugin
description: Update the installed skyline-grok plugin to the latest published version. Refreshes the marketplace clone, installs the new version, verifies it, and prompts a restart. Invoke when the user asks to update or refresh the skyline plugin or its hooks, or after a skyline-grok release.
---

# Update the skyline-grok plugin

The plugin's hooks (enforce, skylore-deposit) load from the installed plugin directory at session start, so a published release does not take effect until the plugin is updated AND the session is restarted. This skill performs that update. It does not touch the skyline binary or daemon; use the `upgrade` skill for those.

## Steps

1. Refresh the marketplace clone so it sees the latest release:
   ```
   grok plugin marketplace update skylence-plugins
   ```
2. Install the new version:
   ```
   grok plugin update skyline-grok
   ```
   If that fails to resolve the plugin, reinstall with trust:
   ```
   grok plugin install skyline-grok@skylence-be/skylence-plugins --trust
   ```
3. Verify the version advanced (CLI output or the installed plugin's `plugin.json` under `~/.grok/installed-plugins/`). If the CLI reports it is already current, say so and stop.
4. Tell the user to **restart the Grok session** to load the new hooks. The update does not affect the running session.

## Notes

- Other harnesses have their own installers, e.g. `claude plugin update skyline-claude@skylence-plugins`.
- This skill is non-deterministic on purpose: read the reported version delta and report the real outcome instead of assuming success.
