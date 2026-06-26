---
name: uninstall-skill
description: Uninstall the skyway-codex plugin — removes the skyway MCP wiring from the host. Leaves the skyway daemon, binary, and data intact (manage those with `skyway` directly). Use when the user wants to remove the skyway plugin.
---

Removing this plugin only removes the skyway MCP wiring (`http://127.0.0.1:3090/mcp`). It does NOT touch the skyway daemon, background service, binary, or data dir — skyway is a standalone tool the user installs and runs themselves, and its daemon is shared by the other skyway-* host plugins, so tearing it down here would break them.

Prefer the bundled script:

```bash
if [ -n "${CODEX_PLUGIN_ROOT:-}" ] && [ -f "$CODEX_PLUGIN_ROOT/scripts/uninstall.sh" ]; then
  bash "$CODEX_PLUGIN_ROOT/scripts/uninstall.sh"
else
  codex plugin remove skyway-codex@skylence-plugins 2>/dev/null \
    || codex plugin remove skyway-codex --marketplace skylence-plugins 2>/dev/null || true
fi
```

To remove the skyway install itself (only if the user explicitly asks — never as part of a plugin uninstall), use skyway directly:

```bash
skyway daemon stop            # stop the shared daemon
skyway service uninstall -y   # remove daemon autostart (launchd/systemd/task)
skyway uninstall --purge      # remove the binary AND ~/.skylence/harness-builder (config, DB, workflows)
```

After uninstalling the plugin, verify and report facts, not assumptions:

```bash
command -v skyway || true   # still present is EXPECTED — the plugin leaves the binary in place
```

The plugin uninstall is done once the MCP wiring is gone. Do not remove the binary, daemon, or data unless the user explicitly requests it.
