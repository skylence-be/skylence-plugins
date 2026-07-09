---
name: skybox-uninstall
description: Remove skybox MCP wiring, stop the launchd daemons, and remove the plugin (keeps the binary and per-repo indexes). Use when the user wants to remove skybox.
---

Run the full uninstall flow. Prefer the bundled script when available:

```bash
if [ -n "${GROK_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-}}" ] && [ -f "${GROK_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-}}/scripts/uninstall.sh" ]; then
  bash "${GROK_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-}}/scripts/uninstall.sh"
else
  command -v skybox >/dev/null 2>&1 && skybox mcp uninstall 2>/dev/null || true
  for unit in be.skylence.skybox.mcp be.skylence.skybox.api; do
    launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/$unit.plist" 2>/dev/null || true
  done
  grok plugin uninstall skybox-grok 2>/dev/null || true
  rm -rf \
    "${XDG_CONFIG_HOME:-$HOME/.config}/skybox" \
    "${XDG_CACHE_HOME:-$HOME/.cache}/skybox" \
    "$HOME/Library/Application Support/skybox" \
    "$HOME/Library/Caches/skybox"
fi
```

The skybox binary, the shared `sky` / `sky-graph` dispatchers, and per-repo `.skybox/` indexes are intentionally left in place. After running, verify and report facts: `command -v skybox`, `pgrep -af 'skybox mcp serve'`. Do not claim manual cleanup steps unless a verification shows a concrete remaining artifact.
