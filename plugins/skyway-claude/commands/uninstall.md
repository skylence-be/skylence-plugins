---
description: Uninstall the skyway-claude plugin (removes the skyway MCP wiring). Leaves the skyway daemon, binary, and data intact.
---

Run the uninstall script. It removes only the skyway MCP wiring from this host; it does NOT touch the skyway daemon, background service, binary, or data dir — skyway is a standalone tool you manage with `skyway` directly (and its daemon is shared by the other skyway-* host plugins).

```
skyline_run(["bash", "${CLAUDE_PLUGIN_ROOT}/scripts/uninstall.sh"])
```

After the script completes, report the verification lines it printed (the skyway binary remaining on PATH is expected). To remove the skyway install itself, the user runs `skyway uninstall --purge` directly — never as part of this plugin uninstall.
