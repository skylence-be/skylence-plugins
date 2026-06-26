# Skyline Plugins

Marketplace repo for the Skyline binary plugins. Exposes the Skyline MCP daemon
to Claude Code, Codex, and Antigravity with agent-side hooks that steer native
file work toward Skyline's hash-guarded tools.

## Prerequisite

Install and bootstrap Skyline first:

```bash
npm install -g @skylence-ai/skyline
skyline setup
```

`skyline setup` installs the shared HTTP daemon on port 7333 and installs the
optional marketplace plugins when supported agent CLIs are available.

## Claude Code

```bash
claude plugin marketplace add skylence-be/skylence-plugins --scope user
claude plugin install skyline-claude --scope user
```

Restart Claude Code after installing the plugin.

## Codex

```bash
codex plugin marketplace add skylence-be/skylence-plugins
codex plugin add skyline-codex@skylence-plugins
```

Restart Codex after installing the plugin.

## skybox-claude (Claude Code)

Separate, optional plugin that wires the **skybox** code-knowledge-graph MCP
daemon (HTTP, port 7070) into Claude Code. skybox is read-only graph navigation
(`query` / `context` / `impact` / `route_map` + indexing) — it complements
Skyline's editing tools and does not replace native file tools, so it ships a
daemon watchdog monitor and a CLI→MCP enforcement hook (which redirects
`skybox index` / `query` / `search` / `status` in the shell to the richer MCP
tools), but no native-file-tool enforcement.

```bash
# ensure the skybox MCP daemon is serving on port 7070 (or via its launchd agent)
skybox mcp serve --transport http --bind 127.0.0.1 --port 7070

claude plugin marketplace add skylence-be/skylence-plugins --scope user
claude plugin install skybox-claude --scope user
```

Index a repo with `skybox index <path>`; then the `skybox` MCP tools are
available in a fresh Claude Code session.

## Included plugins

- `skyline-claude`: plugin-local HTTP MCP config, PreToolUse enforcement,
  daemon watchdog monitor, and `upgrade` / `uninstall` commands.
- `skyline-codex`: plugin-local HTTP MCP config, SessionStart steering skill,
  PreToolUse enforcement hooks, and `upgrade` / `uninstall` skills.
- `skyline-antigravity`: Antigravity-side MCP config, hooks, and skills for
  Skyline daemon integration.
- `skybox-claude`: plugin-local HTTP MCP config wiring the skybox
  code-knowledge-graph daemon (port 7070), a daemon watchdog monitor, a CLI→MCP
  enforcement hook (steers `skybox` CLI subcommands to the MCP tools), and
  `upgrade` / `uninstall` commands. No native-file-tool enforcement (it does not
  replace Read/Edit/Write).
- `skybox-codex`: Codex sibling of `skybox-claude` — plugin-local HTTP MCP
  config (port 7070), the same CLI→MCP enforcement hook, and `upgrade` /
  `uninstall` skills. No daemon watchdog (Codex has no monitor system).
- `skybox-antigravity`: Google Antigravity sibling — `mcp_config.json` MCP
  wiring (port 7070), a `run_command` CLI→MCP enforcement hook (STDIN/STDOUT
  decision contract), and `upgrade` / `uninstall` skills.

## Verify

```bash
skyline daemon status
```

The port 7333 row should show `running`. In a fresh agent session, the Skyline
MCP tools should include `skyline_read`, `skyline_grep`, `skyline_edit`,
`skyline_git`, and `skyline_run`.

## Upgrade and removal

- Claude: run `/upgrade` or `/uninstall` from the `skyline-claude` plugin.
- Codex: ask for the Skyline upgrade or uninstall skill.

Manual removal commands are printed by the uninstall flow. Package removal uses
the package manager you installed with, for example
`npm uninstall -g @skylence-ai/skyline`.
