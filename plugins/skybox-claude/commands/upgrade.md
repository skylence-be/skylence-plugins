---
description: Restart the skybox MCP daemon on the latest binary and print plugin refresh steps.
---

Run the skybox upgrade script to restart the daemon so it picks up the latest installed binary:

```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/upgrade.sh"
```

After the script completes, show the user the plugin-update steps it printed and remind them to restart the session. Note: skybox has no in-place `update` subcommand — the binary itself is updated through its own release/install, and this command only restarts the daemon and refreshes the plugin.
