---
name: skycastle-operate
description: Operate skycastle secrets and vault through the skycastle MCP tools. Use to read, write, list, or delete secrets, manage versions/tags, check KMS/certificates/SSH/PAM, scan for leaked secrets, or refresh tokens. Daemon: http://127.0.0.1:8210.
---

skycastle = secrets-manager / vault daemon. MCP server `skycastle` on 127.0.0.1:8210; tools are served by this server. The vault server runs on :8200 (can be SEALED); the MCP proxy runs on :8210.

PRECHECK: a failing skycastle MCP call usually means the daemon is down or the vault is sealed.
- MCP down → wait and retry; restart with `launchctl kickstart -k gui/$(id -u)/be.skylence.skycastle.mcp`. Never substitute the native CLI for a down MCP.
- Vault sealed (503) → `skycastle unseal` before any secret operation.
Never fall back to the native `skycastle secrets` CLI when the MCP is available — the MCP is the authoritative path.

SECRET CRUD
- get secret: secret get by name/path, optionally at a specific version
- set secret: secret set (creates or updates; bumps version)
- list secrets: list by path prefix or tag
- delete secret: soft-delete (retains version history)
- versions: list all versions of a secret; restore a prior version
- tags: read or update secret tags/metadata

FEATURES
- features: inspect enabled vault features and license state

KMS
- kms: encrypt/decrypt data via the vault KMS; manage encryption keys

CERTIFICATES
- certificates: issue, list, revoke, and inspect TLS certificates from the vault CA

SSH
- ssh: sign SSH public keys; list signed-key metadata

SECRET SCANNING
- scan: scan a repository or diff for leaked secrets (runs server-side pattern matching)

PAM
- pam: inspect PAM-integrated credential sets; rotate credentials

AI TOOLS
- ai: AI-assisted secret discovery, classification, and risk scoring

TOKEN
- token refresh: refresh the agent's vault token before it expires; inspect current token TTL

RULES: never assume vault state — read it from the MCP response. Surface seal status before any secret operation. Down MCP ⇒ wait + retry, not native CLI fallback. Sealed vault ⇒ unseal first, not retry in a loop.
