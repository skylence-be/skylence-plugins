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

# End stale Claude plugin watchdogs (if any) before plugin cache removal.
pgrep -f '/skybox-claude/.*/monitors/' 2>/dev/null | while read -r pid; do kill "$pid" 2>/dev/null || true; done

# Remove the Claude plugin.
if command -v claude >/dev/null 2>&1; then
  claude plugin uninstall skybox-claude --scope user 2>/dev/null || claude plugin uninstall skybox-claude 2>/dev/null || true
fi

# Remove skybox-owned per-user state. INTENTIONALLY LEFT IN PLACE: per-repo
# `.skybox/` index dirs, the shared `sky`/`sky-graph` dispatchers, and the
# skybox binary itself (the binary/dispatchers may be shared with other tools).
rm -rf \
  "${XDG_CONFIG_HOME:-$HOME/.config}/skybox" \
  "${XDG_CACHE_HOME:-$HOME/.cache}/skybox" \
  "$HOME/Library/Application Support/skybox" \
  "$HOME/Library/Caches/skybox"

# Verification output for the agent/user.
echo "skybox-claude uninstall verification:"
printf 'skybox: '; command -v skybox || true
pgrep -af 'skybox mcp serve' || echo "no skybox mcp serve process running"
for unit in be.skylence.skybox.mcp be.skylence.skybox.api; do
  if [ -f "$HOME/Library/LaunchAgents/$unit.plist" ]; then
    echo "launchd plist still exists: $unit.plist"
  else
    echo "launchd plist absent: $unit.plist"
  fi
done
