---
description: Remove skybox MCP wiring, launchd daemons, and the Claude plugin (keeps the binary and per-repo indexes).
---

Run the skybox uninstall script to remove the MCP wiring, stop the launchd-managed daemons, and remove the installed plugin:

```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/uninstall.sh"
```

After the script completes, report the verification lines it printed. The skybox binary, the shared `sky`/`sky-graph` dispatchers, and each repo's local `.skybox/` index are intentionally left in place; only mention manual cleanup if the verification output shows a concrete remaining artifact.
