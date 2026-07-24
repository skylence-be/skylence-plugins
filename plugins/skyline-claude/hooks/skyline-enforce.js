// PreToolUse enforcement: redirect native tools to skyline equivalents.
// Cross-platform (Windows/macOS/Linux) port of skyline-enforce.sh — invoked as
// `node skyline-enforce.js <mode>` so it needs no shell and no bash on PATH.
// Fail-open (exit 0) when the daemon is not running — never breaks the agent.

const http = require("http");

const MODE = process.argv[2] || "";

const CORE =
  "select:mcp__skyline__read," +
  "mcp__skyline__edit," +
  "mcp__skyline__create," +
  "mcp__skyline__grep," +
  "mcp__skyline__tree," +
  "mcp__skyline__find," +
  "mcp__skyline__git," +
  "mcp__skyline__run";

const SILENT = "Comply silently: don't narrate the redirect or the tool switch to the user, just retry with the suggested tool.";
const SWITCH_ORIENT = `Skyline is active. Switch to skyline tools for this session: run ToolSearch("${CORE}") then retry. ${SILENT}`;
const SWITCH_EDIT = `Skyline is active. Switch to skyline tools for this session: run ToolSearch("${CORE}") then mcp__skyline__guide, then retry. ${SILENT}`;

const MESSAGES = {
  read: `skyline's read (mcp__skyline__read) replaces Read. ${SWITCH_ORIENT}`,
  edit: `skyline's edit/create (mcp__skyline__edit / mcp__skyline__create) replace Edit/Write. ${SWITCH_EDIT}`,
  grep: `skyline's grep/sgrep (mcp__skyline__grep / mcp__skyline__sgrep) replace Grep. ${SWITCH_ORIENT}`,
  glob: `skyline's find/tree (mcp__skyline__find / mcp__skyline__tree) replace Glob. ${SWITCH_ORIENT}`,
  bash: `skyline's grep/find/git/run/test (mcp__skyline__grep / find / git / run / test) replace Bash. git is READ-ONLY (status, diff, log, show): commits go through mcp__skyline__git_commit, push/pull/fetch through mcp__skyline__git_remote, worktrees through mcp__skyline__git_worktree; batched commands through mcp__skyline__run_batch and background jobs through mcp__skyline__run_job. Load any of those by name with ToolSearch("select:<name>"). ${SWITCH_EDIT}`,
};

// Fail open unless we positively reach the daemon AND have a message for the mode.
function enforce() {
  const msg = MESSAGES[MODE];
  if (!msg) process.exit(0);
  process.stderr.write(msg + "\n");
  process.exit(2);
}

const req = http.get(
  { host: "127.0.0.1", port: 7333, path: "/mcp", timeout: 1000 },
  (res) => {
    res.resume(); // drain and discard; any response means the daemon is up
    enforce();
  }
);
req.on("timeout", () => req.destroy());
req.on("error", () => process.exit(0)); // daemon down / unreachable -> fail open
