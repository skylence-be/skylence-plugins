#!/usr/bin/env bash
set -e

# 1. Update the skyline binary to the latest release. Public-npm installs (the
# end-user distribution) are routed to npm by `skyline update` itself since
# binary-skyline#772, so pick the updater that actually applies: npm for an
# npm-managed install, skyline's own GitHub update chain otherwise.
if skyline update --check 2>&1 | grep -qi 'managed by npm'; then
  npm i -g @skylence-ai/skyline@latest
else
  skyline update --yes
fi

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
