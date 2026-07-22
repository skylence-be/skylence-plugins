#!/usr/bin/env bash
set -e

# 1. Update the skyline binary itself to the latest GitHub release.
skyline update --yes

# 2. Restart the daemon so it runs the freshly installed binary.
skyline daemon restart --port 7333 2>/dev/null || skyline daemon install --port 7333

echo ""
echo "skyline binary updated and daemon restarted."
echo ""
echo "To update the skyline-claude plugin, run the skyline-claude:update-plugin skill, or:"
echo "  claude plugin marketplace update skylence-plugins && claude plugin update skyline-claude@skylence-plugins"
echo "  codex plugin marketplace upgrade skylence-plugins"
echo ""
echo "Restart your agent session to load the updated plugin."
