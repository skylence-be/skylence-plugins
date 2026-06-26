---
name: uninstall-skill
description: Remove skybox MCP wiring, stop the launchd daemons, and remove the plugin (keeps the binary and per-repo indexes). Use when the user wants to remove skybox.
---

Run the full uninstall flow. Prefer the bundled script when available:

```bash
if [ -n "${CODEX_PLUGIN_ROOT:-}" ] && [ -f "$CODEX_PLUGIN_ROOT/scripts/uninstall.sh" ]; then
  bash "$CODEX_PLUGIN_ROOT/scripts/uninstall.sh"
else
  # Remove the skybox MCP wiring while the CLI is available.
  command -v skybox >/dev/null 2>&1 && skybox mcp uninstall 2>/dev/null || true
  # Stop + unload the launchd-managed skybox daemons.
  for unit in be.skylence.skybox.mcp be.skylence.skybox.api; do
    launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/$unit.plist" 2>/dev/null || true
  done
  # Remove the plugin (Codex requires the marketplace-qualified name on recent CLIs).
  codex plugin remove skybox-codex@skylence-plugins 2>/dev/null || codex plugin remove skybox-codex --marketplace skylence-plugins 2>/dev/null || true
  # Remove skybox-owned per-user state (NOT per-repo .skybox/ indexes or the shared binary/dispatchers).
  rm -rf \
    "${XDG_CONFIG_HOME:-$HOME/.config}/skybox" \
    "${XDG_CACHE_HOME:-$HOME/.cache}/skybox" \
    "$HOME/Library/Application Support/skybox" \
    "$HOME/Library/Caches/skybox"
fi
```

The skybox binary, the shared `sky` / `sky-graph` dispatchers, and per-repo `.skybox/` indexes are intentionally left in place. After running, verify and report facts: `command -v skybox`, `pgrep -af 'skybox mcp serve'`. Do not claim manual cleanup steps unless a verification shows a concrete remaining artifact.
