# skyline-codex

Wires the skyline MCP daemon into Codex with a local HTTP MCP server and
PreToolUse hooks that steer supported native Codex tools toward skyline-first
tooling while the daemon is running.

## What it intercepts

The hook config currently targets Codex tool names that are known to dispatch
PreToolUse events:

- `Read` -> `skyline_read`
- `Edit|Write|apply_patch` -> `skyline_edit` / `skyline_create`
- `Grep` -> `skyline_grep` / `skyline_sgrep`
- `Glob` -> `skyline_find` / `skyline_tree`
- `Bash` -> `skyline_run`, `skyline_git`, `skyline_test`, and related skyline
  tools

When the skyline daemon is unreachable, the hooks fail open so the agent is not
blocked by a local daemon outage.

## Known Codex limitation

Fresh-session testing showed that Codex does not currently dispatch a
PreToolUse event for developer-provided shell tools exposed as
`functions.shell_command` / `shell_command`. Those calls can appear in the
session JSONL as `shell_command` and execute without any hook event, even when
the installed hook is trusted and the hook runner denies correctly when invoked
directly.

Because a hook matcher is only evaluated after Codex dispatches `PreToolUse`,
the plugin does not claim to enforce `functions.shell_command` or
`shell_command`. The remaining fix for that path is Codex-side hook dispatch
support or explicit Codex documentation that developer-provided tools are out
of hook scope.

Tracked upstream as:

- https://github.com/skylence-be/skyline/issues/11
