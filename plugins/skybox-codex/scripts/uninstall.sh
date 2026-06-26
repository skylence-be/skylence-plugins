#!/usr/bin/env bash
set -u

run_optional() { "$@" 2>/dev/null || true; }

# Remove the skybox MCP wiring (~/.claude.json entry) while the CLI is available.
if command -v skybox >/dev/null 2>&1; then
  run_optional skybox mcp uninstall
fi

# Stop + unload the launchd-managed skybox daemons (mcp + api).
for unit in be.skylence.skybox.mcp be.skylence.skybox.api; do
  run_optional launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/$unit.plist"
done

# Remove the plugin.
if command -v codex >/dev/null 2>&1; then
  codex plugin remove skybox-codex@skylence-plugins 2>/dev/null || codex plugin remove skybox-codex --marketplace skylence-plugins 2>/dev/null || true
fi

# Remove skybox-owned per-user state. INTENTIONALLY LEFT: per-repo `.skybox/`
# indexes, the shared `sky`/`sky-graph` dispatchers, and the skybox binary.
rm -rf \
  "${XDG_CONFIG_HOME:-$HOME/.config}/skybox" \
  "${XDG_CACHE_HOME:-$HOME/.cache}/skybox" \
  "$HOME/Library/Application Support/skybox" \
  "$HOME/Library/Caches/skybox"

# Verification output.
echo "skybox-codex uninstall verification:"
printf 'skybox: '; command -v skybox || true
pgrep -af 'skybox mcp serve' || echo "no skybox mcp serve process running"
for unit in be.skylence.skybox.mcp be.skylence.skybox.api; do
  if [ -f "$HOME/Library/LaunchAgents/$unit.plist" ]; then
    echo "launchd plist still exists: $unit.plist"
  else
    echo "launchd plist absent: $unit.plist"
  fi
done
