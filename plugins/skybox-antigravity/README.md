# skybox-antigravity

Wires the [skybox](https://github.com/skylence-be) code-knowledge-graph MCP
daemon into **Google Antigravity**: one HTTP MCP server (cross-repo `query` /
`context` / `impact` / `route_map` + indexing) plus a `PreToolUse` hook that
redirects `skybox` CLI subcommands run in the shell to the richer MCP tools.

This plugin is the Antigravity sibling of `skybox-claude` (Claude Code) and
`skybox-codex` (Codex). skybox is read-only code-graph navigation — it
complements, and does not replace, native file tools, so unlike the skyline
plugins it ships **no native-file-tool enforcement** (no `view_file` /
`write_to_file` redirection).

## What it does

- Registers a single HTTP MCP server, `skybox`, pointing at the local skybox
  daemon (`http://127.0.0.1:7070/mcp`).
- Installs a `PreToolUse` hook on `run_command`. When the daemon is up and the
  shell command invokes a `skybox` CLI subcommand with an MCP equivalent
  (`index` / `query` / `search` / `status` / `list` / `affected` / `augment`),
  the call is **denied** with a message steering the agent to the MCP tool
  (`index_repo`, `query`, `list_repos`, `impact`, ...). LLMs habitually run
  `skybox index` in the shell and then miss the indexed-graph MCP tools; this
  redirects them. Ops-only verbs (`mcp serve`, `doctor`, `install`, ...) pass
  through.
- **Fails open:** if the daemon is unreachable (or `curl` is missing), the hook
  returns `{"decision":"allow"}` — the skybox CLI works without the MCP daemon,
  so blocking it then would strand the agent.
- Ships `upgrade` and `uninstall` skills that drive the skybox daemon lifecycle.

## The daemon dependency

This plugin assumes the skybox binary and its MCP daemon are installed.

- **Daemon endpoint:** `http://127.0.0.1:7070/mcp` (HTTP MCP). Port `7070` is
  shared with the Claude/Codex variants.
- **Lifecycle:** launchd unit `be.skylence.skybox.mcp` (RunAtLoad + KeepAlive),
  or `skybox mcp serve --transport http --bind 127.0.0.1 --port 7070`.
- **Update:** skybox has no in-place `update`; the binary is updated via its own
  release/install, then restart the daemon.

## File tree

```
plugins/skybox-antigravity/
├── plugin.json              # manifest (mcpServers -> ./mcp_config.json)
├── mcp_config.json          # HTTP MCP server "skybox" -> 127.0.0.1:7070/mcp
├── hooks.json               # PreToolUse run_command -> hooks/skybox-enforce.sh
├── hooks/
│   └── skybox-enforce.sh    # daemon health check + allow/deny JSON on STDOUT
├── scripts/
│   └── uninstall.sh         # bundled uninstall flow
├── skills/
│   ├── upgrade/SKILL.md
│   └── uninstall/SKILL.md
└── README.md
```

## Hook contract

Antigravity hooks receive the pending tool-call JSON on **STDIN** and must print
a JSON object on **STDOUT** with a `"decision"` field (`allow` / `deny`). The
matcher is `run_command` (the shell tool) — the only path a `skybox` CLI call
arrives through. The plugin root resolves via `CLAUDE_PLUGIN_ROOT` (the env var
Antigravity exposes), with `ANTIGRAVITY_PLUGIN_ROOT` / `GEMINI_PLUGIN_ROOT` as
fallbacks. `skybox-enforce.sh` is POSIX `sh`, drains STDIN, performs a
`curl -s -m 1 http://127.0.0.1:7070/mcp` health check, and fails open on any
uncertainty.

## ⚠️ Still needs verification

1. **Coarse CLI detection.** The hook greps the drained STDIN payload for a
   `skybox <verb>` token; a literal text-search for that same string (e.g.
   `grep "skybox index"`) could be matched. Acceptable because the deny message
   is informative and non-destructive, but a structured parse of `toolCall.args`
   would be tighter once the exact Antigravity payload shape is pinned.
2. **`plugin.json` `mcpServers` pointer shape.** We keep
   `"mcpServers": "./mcp_config.json"`, matching the skyline-antigravity sibling;
   whether that exact field is the accepted form vs. auto-discovery is
   unconfirmed.
3. **Marketplace wiring.** Registered in the repo's `.agents/plugins/marketplace.json`
   (the Antigravity/Codex manifest) as a `local` source, alongside
   `skybox-codex`.
