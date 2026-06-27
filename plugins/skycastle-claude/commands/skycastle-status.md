---
description: Report skycastle vault and MCP daemon health, seal status, and current identity.
---

Run these and report the output verbatim (do not assume state):

```
skycastle ops status
skycastle whoami
```

Also probe both daemon ports directly:
- Vault server `be.skylence.skycastle.server` on :8200 — if sealed, secret reads return 503 until unsealed (`skycastle unseal`).
- MCP HTTP server `be.skylence.skycastle.mcp` on :8210 — if down, the skycastle MCP tools are unavailable; restart with: `launchctl kickstart -k gui/$(id -u)/be.skylence.skycastle.mcp`

- If the vault is sealed: say so; offer `skycastle unseal` before attempting any secret operations.
- If the MCP is down: say so; wait and retry rather than falling back to the native CLI.
