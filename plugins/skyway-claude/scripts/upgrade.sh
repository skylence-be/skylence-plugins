#!/usr/bin/env bash
set -e

# 1. Update the skyway binary itself to the latest GitHub release.
skyway update -y

# 2. Restart the daemon so it runs the freshly installed binary.
#    skyway is config-driven (daemon listens on 127.0.0.1:3090); no --port flag.
skyway daemon restart 2>/dev/null || skyway serve &

echo ""
echo "skyway binary updated and daemon restarted."
echo ""
echo "To pull the latest plugins, run:"
echo "  claude plugin marketplace update skylence-plugins && claude plugin update skyway-claude"
echo ""
echo "Restart your agent session to load the updated plugin."
