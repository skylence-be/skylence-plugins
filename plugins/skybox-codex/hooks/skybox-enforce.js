// PreToolUse enforcement (skybox): block `skybox` CLI subcommands that have a
// richer MCP-tool equivalent and steer the agent to the MCP tool instead.
// LLMs habitually run `skybox index` / `skybox query` in the shell and then miss
// the indexed-graph MCP tools (index_repo, query, impact, ...). This redirects
// them.
//
// Fires on BOTH native `Bash` and `skyline_run` (when skyline-claude is also
// installed, native Bash is already redirected to skyline_run, so the skybox CLI
// would arrive via skyline_run's argv).
//
// Detection is precise to avoid false positives:
//   - `argv` arrays are inspected STRUCTURALLY: basename(argv[0]) must be skybox
//     /sky-graph and the first non-flag token must be a redirected subcommand.
//     (So `grep "skybox index"` — a search pattern — is NOT mistaken for a
//     command.) `sh -c "<script>"` argv falls back to shell-string scanning.
//   - Plain shell strings (Bash.command) are regex-scanned at command position
//     only (not inside a quoted argument).
//
// Only the read+index verbs with a clear MCP equivalent are blocked; pure-ops
// verbs (mcp serve/install, doctor, hooks, watch, gateway, config, export, ...)
// pass through untouched.
//
// FAIL-OPEN: if the skybox MCP daemon (7070) is NOT up, the MCP tools are not
// available and the CLI is the only option, so we allow it (exit 0). Any parse
// problem or non-skybox command also exits 0.

const http = require("http");

const REDIRECT = new Set([
  "index",
  "query",
  "search",
  "status",
  "list",
  "affected",
  "augment",
]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);

// skybox CLI subcommand -> the MCP tool(s) to use instead.
const MAP = {
  index: "the index_repo MCP tool (poll completion with wait_for_job)",
  query: "the query MCP tool (or cypher for a raw Cypher query)",
  search: "the query MCP tool",
  status: "the repo_status / list_repos MCP tools",
  list: "the list_repos MCP tool",
  affected: "the detect_changes / impact MCP tools",
  augment: "the query MCP tool",
};

function basename(p) {
  return String(p).split(/[\\/]/).pop();
}

// Command position only: start, whitespace, ; & | ( backtick, or a path slash.
// Quotes are deliberately excluded so a quoted search pattern does not match.
const SHELL_RE =
  /(?:^|[\s;&|`(/])(?:skybox|sky-graph)\s+(index|query|search|status|list|affected|augment)\b/;

function detectFromShellString(s) {
  const m = SHELL_RE.exec(String(s));
  return m ? m[1] : null;
}

function detectFromArgv(argv) {
  if (!Array.isArray(argv) || argv.length === 0) return null;
  const prog = basename(argv[0]);
  if (SHELLS.has(prog)) {
    const ci = argv.indexOf("-c");
    if (ci >= 0 && argv[ci + 1] != null) return detectFromShellString(argv[ci + 1]);
    return null;
  }
  if (prog === "skybox" || prog === "sky-graph") {
    for (let i = 1; i < argv.length; i++) {
      const t = String(argv[i]);
      if (t.startsWith("-")) continue; // skip global flags
      return REDIRECT.has(t) ? t : null; // first positional = subcommand
    }
  }
  return null;
}

function detect(ti) {
  if (!ti || typeof ti !== "object") return null;
  if (typeof ti.command === "string") {
    const s = detectFromShellString(ti.command); // Bash
    if (s) return s;
  }
  if (Array.isArray(ti.argv)) {
    const s = detectFromArgv(ti.argv); // skyline_run
    if (s) return s;
  }
  if (Array.isArray(ti.argv_list)) {
    for (const a of ti.argv_list) {
      const s = detectFromArgv(a); // skyline_run batch
      if (s) return s;
    }
  }
  return null;
}

function block(sub) {
  const msg =
    "Use the skybox MCP tools, not the `skybox " +
    sub +
    "` CLI — the CLI bypasses the indexed code-graph tools you should be using. " +
    "For `skybox " +
    sub +
    "`, use " +
    (MAP[sub] || "the equivalent skybox MCP tool") +
    ". If the skybox MCP tools are not loaded, run " +
    'ToolSearch("select:mcp__skybox__index_repo,mcp__skybox__wait_for_job,mcp__skybox__query,mcp__skybox__list_repos,mcp__skybox__repo_status,mcp__skybox__impact,mcp__skybox__detect_changes") ' +
    "then retry via the MCP tool.";
  process.stderr.write(msg + "\n");
  process.exit(2);
}

let buf = "";
// Safety: if the host never pipes/closes stdin, fail open instead of hanging.
const stdinGuard = setTimeout(() => process.exit(0), 2000);
if (stdinGuard.unref) stdinGuard.unref();
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("error", () => process.exit(0));
process.stdin.on("end", () => {
  clearTimeout(stdinGuard);
  let sub = null;
  try {
    const input = JSON.parse(buf || "{}");
    sub = detect(input.tool_input || input.toolInput || {});
  } catch (_e) {
    process.exit(0);
  }
  if (!sub) process.exit(0);

  // Only enforce while the skybox MCP daemon is up; otherwise the CLI is the
  // only working path, so allow it (fail open).
  const req = http.get(
    { host: "127.0.0.1", port: 7070, path: "/mcp", timeout: 1000 },
    (res) => {
      res.resume();
      block(sub);
    }
  );
  req.on("timeout", () => req.destroy());
  req.on("error", () => process.exit(0)); // skybox MCP down -> allow CLI
});
