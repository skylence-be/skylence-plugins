# Open-Source Repositories Relevant to Sky Stack Keywords (2026-07-10)

Supporting research for the sky stack (binary-skyline, binary-skybox, binary-skyway, binary-skycastle, and related).

**Keywords/themes covered:**
- Code knowledge graphs / indexing / hybrid search for AI coding agents (skybox-like)
- Context optimization, sandboxing, session continuity, safe/hash-guarded editing (skyline + context-mode-like)
- Agent harnesses / structured workflows for Claude Code (skyway-like)
- Self-hosted secrets / credential management for agents (skycastle-like)

Researched via web searches for "open source MCP server code graph", "Claude Code harness", "hash guarded edit MCP", "AI agent secrets vault", etc. (as of 2026-07-10).

## Code Knowledge Graphs & Indexing MCP Servers (skybox-like)
- [ ] [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph)  
  Pre-indexed code knowledge graph (Tree-sitter), auto-sync on changes, MCP server exposing search/context/impact-style tools. Targets Claude Code, Cursor, Codex, Gemini, OpenCode, Hermes, etc. Local-first, aims for fewer tokens and tool calls.  
  **Comparison to skybox:** Strong overlap in pre-built graph + MCP query surface for reduced agent context burn. Skybox uses lbug graph + embeddings/FTS/HNSW + groups/gateway; this is more symbol-graph focused with broader agent wiring. No full public SWOT.

- [ ] [CodeGraphContext/CodeGraphContext](https://github.com/CodeGraphContext/CodeGraphContext)  
  MCP server + CLI that indexes code into a queryable graph DB (files, functions, classes, relationships). Symbol-level graphs for AI context. Includes playground/demo.  
  **Comparison to skybox:** Very similar goal (graph DB for agent context instead of raw reads). Skybox emphasizes embeddings + hybrid search + cross-repo groups.

- [ ] [vitali87/code-graph-rag (Code-Graph-RAG)](https://github.com/vitali87/code-graph-rag)  
  Builds knowledge graphs from codebases (Tree-sitter), RAG features, runs as MCP server with tools for natural-language query/edit/optimize. Multi-language monorepo support.  
  **Comparison to skybox:** Graph + RAG/MCP exposure. Skybox has stronger emphasis on embeddings, FTS/BM25, impact analysis, and snapshots.

- [ ] [FalkorDB/code-graph](https://github.com/FalkorDB/code-graph)  
  Converts Git repos into navigable knowledge graphs (nodes for modules/classes/functions; edges like CALLS/INHERITS/DEPENDS) queryable via Cypher.  
  **Comparison to skybox:** Graph model + query interface. Skybox uses property graph (lbug) with MCP tools and embeddings; this leverages FalkorDB for graph queries.

- [ ] CodeSeeker (e.g. jghiringhelli/codeseeker and related)  
  Graph-powered code intelligence MCP with hybrid search (BM25 + vector + RAPTOR summaries + graph expansion) and dependency analysis. Targets Claude Code, Cursor, Copilot.  
  **Comparison to skybox:** Hybrid search + graph. Skybox adds cross-repo groups, gateway ACL, and dedicated impact/cypher tools.

## Context Optimization, Sandboxing & Safe Editing (skyline / context-mode-like)
- [x] [mksglu/context-mode](https://github.com/mksglu/context-mode)  
  **Already analysed** with full SWOT analysis and comparison to the sky stack (binary-skyline, binary-skybox, etc.) in the private gist (see `01-context-mode-20260710.md` and template).  
  Sandboxed tool execution (98% context reduction), FTS5/BM25 persistent session memory for continuity, routing hooks across 17+ platforms.  
  **Key prior findings:** Strong on compaction-survival and routing; "sandbox" is mostly routing + permission mirror (not OS isolation); headline metrics are proxies; maintenance tax from adapters. Recommendation was ADOPT-PATTERNS with specific kill list.

- [ ] [tumf/mcp-text-editor](https://github.com/tumf/mcp-text-editor)  
  MCP server for line-based text file operations with SHA-256 hash-based validation for safe concurrent edits. Supports partial range reads (token-efficient), atomic multi-file patches, and conflict detection.  
  **Comparison to skyline:** Directly mirrors hash-guarded/content-fingerprint edits to prevent stale or silent overwrites. Skyline adds broader search (grep/sgrep), symbols, run/git/test tools, and daemon architecture.

## Agent Harnesses & Structured Workflows (skyway-like)
- [ ] [Chachamaru127/claude-code-harness](https://github.com/Chachamaru127/claude-code-harness)  
  Dedicated harness for Claude Code enforcing an autonomous Plan → Work → Review → Ship cycle. Includes guardrails, parallel workers, reviews, and release artifacts. MIT-licensed; supports Codex/OpenCode paths.  
  **Comparison to skyway:** Structured delivery loop similar to skyway's webhook-driven .sky workflows + claude CLI execution + real-time streaming. Skyway focuses more on GitHub event triggers; this adds explicit review/quality gates.

## Secrets & Credential Management for Agents (skycastle-like)
- [ ] [Infisical/agent-vault](https://github.com/Infisical/agent-vault)  
  HTTP credential proxy and vault specifically for AI agents (Claude Code, harnesses, custom). Agents never receive secrets directly; the proxy intercepts requests and attaches credentials. Focused on preventing exfiltration.  
  **Comparison to skycastle:** Agent-specific credential isolation layer. Skycastle is a full sealed self-hosted vault (envelope encryption, in-memory root key, passkey/WebAuthn + step-up, RBAC, scoped tokens, audit, org/project/env model, MCP/CLI/HTTP surface).

## Additional Notes
- Only `mksglu/context-mode` has a published detailed SWOT + comparison to the binary-sky* family (in this gist).
- Many of these projects are recent (high activity 2025–2026) and overlap with the "code intelligence for agents" space.
- General self-hosted foundations (less AI-specific): hashicorp/vault and OpenBao.
- This list can directly feed future reports in this gist (e.g., NN-xxx-YYYYMMDD.md files).

**Sources:** Web searches + direct GitHub READMEs (as of 2026-07-10).
