#!/usr/bin/env bash
set -u

# Uninstall the skyway-antigravity plugin.
#
# This plugin ONLY wires the skyway MCP server (http://127.0.0.1:3090/mcp) into
# the host; removing the plugin removes that wiring. It deliberately does NOT
# touch the skyway daemon, background service, binary, or data dir. skyway is a
# standalone tool you install and run yourself, and its daemon is shared by the
# other skyway-* host plugins, so tearing it down here would break them.
#
# Manage the skyway install itself with skyway directly:
#   skyway daemon stop             # stop the shared daemon
#   skyway service uninstall -y    # remove daemon autostart (launchd/systemd/task)
#   skyway uninstall [--purge]     # remove the binary (and ~/.skylence/harness-builder with --purge)

# Remove the host plugin registration.
if command -v agy >/dev/null 2>&1; then
  agy plugin uninstall skyway-antigravity 2>/dev/null || true
fi

# Verification.
echo "skyway-antigravity uninstall: MCP wiring removed; skyway install left intact."
printf 'skyway binary (left in place): '; command -v skyway || echo "(not on PATH)"
if command -v skyway >/dev/null 2>&1; then
  printf 'skyway daemon (left running; stop with: skyway daemon stop): '
  skyway daemon status 2>/dev/null || echo "(status unavailable)"
fi
echo "Data dir ~/.skylence/harness-builder left intact (remove with: skyway uninstall --purge)."
