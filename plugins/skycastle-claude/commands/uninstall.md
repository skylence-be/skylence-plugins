---
description: Uninstall the skycastle-claude plugin (removes the skycastle MCP wiring). Leaves the skycastle binary, daemon, and vault data intact.
---

Run the uninstall script. It removes only the skycastle MCP wiring from this host; it does NOT touch the skycastle daemon, background service, binary, or vault data — skycastle is a standalone tool you manage with `skycastle` directly.

```
skyline_run(["bash", "${CLAUDE_PLUGIN_ROOT}/scripts/uninstall.sh"])
```

After the script completes, report the verification lines it printed (the skycastle binary remaining on PATH is expected). To remove the skycastle install itself, the user runs `skycastle uninstall` directly — never as part of this plugin uninstall.
