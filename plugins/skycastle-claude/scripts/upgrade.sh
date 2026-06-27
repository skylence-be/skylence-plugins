#!/usr/bin/env bash
set -e

# skycastle has no in-place `update` subcommand; the binary is updated via its
# own release/install. This script restarts the launchd-managed MCP daemon so
# it picks up a freshly installed binary, then prints plugin-refresh steps.

if launchctl kickstart -k "gui/$(id -u)/be.skylence.skycastle.mcp" 2>/dev/null; then
  echo "skycastle MCP daemon restarted (launchd: be.skylence.skycastle.mcp)."
else
  echo "skycastle launchd agent not found; ensure the MCP daemon is serving on port 8210:"
  echo "  ~/.local/bin/skycastle-mcp-http-svc  (or: skycastle mcp http --addr 127.0.0.1:8210)"
fi

echo ""
echo "To pull the latest plugins, run:"
echo "  claude plugin marketplace update skylence-plugins && claude plugin update skycastle-claude"
echo ""
echo "Restart your agent session to load the updated plugin."
