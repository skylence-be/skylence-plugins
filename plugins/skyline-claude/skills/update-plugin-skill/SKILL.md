---
name: update-plugin-skill
description: Update the installed skyline-claude plugin to the latest published version. Refreshes the marketplace clone, installs the new version, verifies it, and prompts a restart. Invoke when the user asks to update or refresh the skyline plugin or its hooks, or after a skyline-claude release.
---

# Update the skyline-claude plugin

The plugin's hooks (enforce, primer, skylore-deposit, regate, nudge) and its jobs-monitor load from the installed cache at session start, so a published release does not take effect until the plugin is updated AND the session is restarted. This skill performs that update. It does not touch the skyline binary or daemon; use the `upgrade` skill for those.

## Steps

1. Refresh the marketplace clone so it sees the latest release:
   ```
   claude plugin marketplace update skylence-plugins
   ```
2. Install the new version. Use the fully-qualified `plugin@marketplace` id: the bare `skyline-claude` fails with "Plugin not found".
   ```
   claude plugin update skyline-claude@skylence-plugins
   ```
3. Verify the version advanced. The CLI prints "updated from X to Y", and `~/.claude/plugins/installed_plugins.json` should show the new `version` + `installPath` for `skyline-claude@skylence-plugins`. If the CLI reports it is already current, say so and stop.
4. Tell the user to RESTART the agent session to load the new hooks (the CLI itself notes "Restart to apply"). The update does not affect the running session.

## If the marketplace refresh fails on git auth

Some machines carry an SSH key that GitHub rejects, so the marketplace clone's `git pull` fails. Retry the refresh with an env-scoped HTTPS + gh-credential rewrite (needs an authenticated `gh`), which leaves no persistent git config:

```
GIT_CONFIG_COUNT=2 \
  GIT_CONFIG_KEY_0=url.https://github.com/.insteadOf GIT_CONFIG_VALUE_0=git@github.com: \
  GIT_CONFIG_KEY_1=credential.helper GIT_CONFIG_VALUE_1='!gh auth git-credential' \
  claude plugin marketplace update skylence-plugins
```

Then re-run step 2.

## Notes

- Other harnesses have their own installers, e.g. `codex plugin marketplace upgrade skylence-plugins`.
- This skill is non-deterministic on purpose: read the reported version delta, choose the auth path that actually works, and report the real outcome instead of assuming success.
