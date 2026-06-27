#!/usr/bin/env bash
set -u

# Uninstall the skycastle-antigravity plugin.
#
# This plugin ONLY wires the skycastle MCP server (http://127.0.0.1:8210/mcp)
# into the host; removing the plugin removes that wiring. It deliberately does
# NOT touch the skycastle daemon, background service, binary, or vault data.
# skycastle is a standalone tool you install and manage yourself.
#
# Manage the skycastle install itself with skycastle directly:
#   skycastle token revoke       # revoke agent tokens
#   skycastle seal               # seal the vault
#   skycastle uninstall          # remove the binary (separate from this plugin)

# Remove the host plugin registration.
if command -v agy >/dev/null 2>&1; then
  agy plugin uninstall skycastle-antigravity 2>/dev/null || true
fi

# Verification.
echo "skycastle-antigravity uninstall: MCP wiring removed; skycastle install left intact."
printf 'skycastle binary (left in place): '; command -v skycastle || echo "(not on PATH)"
if command -v skycastle >/dev/null 2>&1; then
  printf 'skycastle whoami: '
  skycastle whoami 2>/dev/null || echo "(unavailable)"
fi
echo "Vault data left intact. To remove the skycastle install itself, run: skycastle uninstall"
