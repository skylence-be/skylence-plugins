#!/usr/bin/env bash
set -e

# skybox has no in-place `update` subcommand; the binary is updated via its own
# release/install. This script restarts the launchd-managed MCP daemon so it
# picks up a freshly installed binary, then prints plugin-refresh steps.

if launchctl kickstart -k "gui/$(id -u)/be.skylence.skybox.mcp" 2>/dev/null; then
  echo "skybox MCP daemon restarted (launchd: be.skylence.skybox.mcp)."
else
  echo "skybox launchd agent not found; ensure the skybox MCP daemon is serving on port 7070:"
  echo "  skybox mcp serve --transport http --bind 127.0.0.1 --port 7070"
fi

echo ""
echo "To pull the latest plugins, run:"
echo "  claude plugin marketplace update skylence-plugins && claude plugin update skybox-claude"
echo ""
echo "Restart your agent session to load the updated plugin."
