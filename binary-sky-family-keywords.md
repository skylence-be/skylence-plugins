# Binary sky family – keywords and short descriptions (2026-07-10)

Supporting material for the sky stack reviews. Extracted from source + skybox registry.

## binary-skyline

**One-liner:** Hash-guarded search + edit toolkit + always-warm daemon/MCP server that lets AI agents modify code safely with content fingerprints and structural awareness.

**Core value:** Prevents silent overwrites (stale-edit rejection via content hash + tag). Understands code structure (tree-sitter + LS) not just text. Warm daemon eliminates cold-start cost for every agent session.

**Key surface:**
- `skyline_read` / `skyline_edit` (with `¶path#TAG` anchors)
- `skyline_grep`, `skyline_sgrep` (structural/AST)
- `skyline_srewrite`, `skyline_rename`, `skyline_symbols`, `skyline_definition`, `skyline_references`
- `skyline_run`, `skyline_git`, `skyline_test`, `skyline_format`
- Audit, bench, observability streams
- Daemon (port 7333, shared across clients) + MCP (stdio + streamable HTTP)

**Keywords / tags:**
hash-guarded edit, content fingerprint, stale-edit prevention, ¶path#TAG anchor, structural search, sgrep, AST-aware, language server, warm daemon, MCP server, safe AI editing, refactoring toolkit, skyline_read, skyline_edit, audit trail, bench metrics, sky dispatcher, single binary, Rust

**Skybox registry:** name=`binary-skyline`, path=/Users/jv/Code/skylence/binary-skyline, status=fresh (HEAD 84c39f8)

## binary-skybox

**One-liner:** Code knowledge graph engine. Indexes repos into a property graph (lbug/Kuzu fork) with tree-sitter parsing, embeddings, FTS/BM25 + vector search. Exposes rich analysis via CLI, MCP (~50 tools), and HTTP gateway.

**Core value:** Gives agents and tools deep, queryable understanding of code (execution flows, impact, symbols, cross-repo). Hybrid search + groups + snapshots. The "brain" for the sky stack's code intelligence.

**Key surface:**
- `skybox index`, `register`, `query`, `search`, `context`, `impact`, `detect_changes`, `cypher`
- MCP tools for analysis, groups, jobs, gateway admin, wiki generation
- Cross-repo `group_impact`, views, ACL via gateway
- `sky graph` namespace

**Keywords / tags:**
code knowledge graph, property graph, lbug, KuzuDB, tree-sitter, fastembed, hybrid search, FTS, BM25, HNSW vector index, impact analysis, execution flow, cross-repo, groups, gateway, ACL, MCP server, indexing pipeline, repo registry, .skybox storage, detect_changes, cypher, context, query, sky graph, single binary, Rust

**Skybox registry:** name=`binary-skybox`, path=/Users/jv/Code/skylence/binary-skybox, status=fresh (HEAD a273704)

## binary-skyway (skyway)

**One-liner:** GitHub webhook → `.sky` workflow harness. Listens for events, executes matching workflows by driving the `claude` CLI, streams live results over WebSocket/REST. Go binary + dashboard.

**Core value:** Automates agent runs on real repo events (push, PR, etc.). Turns Claude Code into a programmable, observable CI/workflow engine with human-in-the-loop or fully automated steps.

**Key surface:**
- Webhooks + `.sky` workflow definitions
- `skyway serve`, `run <workflow>`, logs
- Real-time WS streaming of claude output
- Integrates with sky dispatcher (`sky hb`), Tolaria (docs graph), lefthook
- Docker + Nuxt dashboard (separate)

**Keywords / tags:**
webhook harness, .sky workflows, claude CLI executor, event-driven automation, real-time streaming, WebSocket, REST API, Go binary, GitHub integration, sky hb, Tolaria, dashboard, workflow engine, Claude Code harness, skyway

**Skybox registry:** name=`skyway` (binary-skyway), path=/Users/jv/Code/skylence/binary-skyway, status=stale (HEAD moved)

## binary-skycastle (skycastle)

**One-liner:** Self-hosted, sealed secrets + identity vault for the entire sky stack. Envelope encryption, in-memory root key, passkey-native humans, short-lived RBAC tokens for machines. Single Rust binary (HTTP/CLI/MCP).

**Core value:** Own the crown jewels. No more scattered .env, rented SaaS vaults, or plaintext on disk/laptops. Everything the sky tools need (keys, tokens, identities) comes from one owned, audited, sealed source.

**Key surface:**
- Sealed DB (ciphertext only), Argon2id + XChaCha20-Poly1305
- WebAuthn / passkeys + step-up for humans
- Machine identities + scoped short-lived tokens + RBAC (path/env)
- Full audit trail
- One binary: HTTP API, CLI (`secrets`, `login`, ...), MCP server
- Org / project / env / secret model

**Keywords / tags:**
secrets manager, sealed vault, envelope encryption, in-memory root key, zeroize, Argon2id, passkey, WebAuthn, step-up auth, RBAC, machine identities, short-lived tokens, audit, self-hosted, crown jewels, no plaintext at rest, skycastle, sky stack identity, MCP, single binary, Rust

**Skybox registry:** name=`binary-skycastle`, path=/Users/jv/Code/skylence/binary-skycastle, status=fresh (HEAD 566ade9)

## Cross-cutting / family notes

- **"binary-*" naming:** Rust (skyline, skybox, skycastle) and Go (skyway) single static binaries that form the core of the self-hosted sky platform.
- **sky dispatcher:** Many install as `sky <namespace>` (e.g. `sky graph`, `sky hb`).
- **MCP everywhere:** All expose stdio + streamable HTTP MCP servers for agents.
- **Self-hosted first:** Explicit rejection of SaaS dependency for critical layers (editing safety, code graph, secrets, automation).
- **Shared concerns:** auditability, least privilege, warm state where possible, content/structure awareness, no silent failures.
- **binary-skylence:** No directory or skybox entry found under that name (as of 2026-07-10). May refer to the broader skylence monorepo / unifying layer or a future binary.

**Sources used:** local READMEs + VISION.md + Cargo.toml/go metadata + skybox `list_repos` / `repo_status` (registry truth).

