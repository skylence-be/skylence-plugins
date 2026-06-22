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

## Included plugins

- `skyline-claude`: plugin-local HTTP MCP config, PreToolUse enforcement,
  daemon watchdog monitor, and `upgrade` / `uninstall` commands.
- `skyline-codex`: plugin-local HTTP MCP config, SessionStart steering skill,
  PreToolUse enforcement hooks, and `upgrade` / `uninstall` skills.
- `skyline-antigravity`: Antigravity-side MCP config, hooks, and skills for
  Skyline daemon integration.

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
