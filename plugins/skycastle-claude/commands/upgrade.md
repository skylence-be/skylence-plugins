---
description: Restart the skycastle MCP daemon and print plugin refresh steps.
---

Run the skycastle upgrade script to restart the MCP daemon and pick up any freshly installed binary:

```
skyline_run(["bash", "${CLAUDE_PLUGIN_ROOT}/scripts/upgrade.sh"])
```

After the script completes, show the user the plugin-update steps printed by the script and remind them to restart the session.
