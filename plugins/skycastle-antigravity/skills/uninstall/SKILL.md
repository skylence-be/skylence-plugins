---
name: uninstall-skill
description: Uninstall the skycastle-antigravity plugin — removes the skycastle MCP wiring from the host. Leaves the skycastle daemon, binary, and vault data intact (manage those with `skycastle` directly). Use when the user wants to remove the skycastle plugin.
---

Removing this plugin only removes the skycastle MCP wiring (`http://127.0.0.1:8210/mcp`). It does NOT touch the skycastle daemon, background service, binary, or vault data — skycastle is a standalone tool the user installs and manages themselves.

Prefer the bundled script:

```bash
ROOT="${CLAUDE_PLUGIN_ROOT:-${ANTIGRAVITY_PLUGIN_ROOT:-${GEMINI_PLUGIN_ROOT:-}}}"
if [ -n "$ROOT" ] && [ -f "$ROOT/scripts/uninstall.sh" ]; then
  bash "$ROOT/scripts/uninstall.sh"
else
  agy plugin uninstall skycastle-antigravity 2>/dev/null || true
fi
```

To remove the skycastle install itself (only if the user explicitly asks — never as part of a plugin uninstall), use skycastle directly:

```bash
skycastle seal            # seal the vault before removing
skycastle uninstall       # remove the binary and daemon wiring
```

After uninstalling the plugin, verify and report facts, not assumptions:

```bash
command -v skycastle || true   # still present is EXPECTED — the plugin leaves the binary in place
```

The plugin uninstall is done once the MCP wiring is gone. Do not remove the binary, daemon, or vault data unless the user explicitly requests it.
