// PreToolUse enforcement (skycastle): block `skycastle` CLI subcommands that
// have a richer MCP-tool equivalent and steer the agent to the MCP tool.
// Agents may run `skycastle secrets get …` / `skycastle export` in the shell
// and bypass the indexed-vault MCP tools. This redirects them.
//
// Fires on BOTH native `Bash` and `skyline_run` (when skyline-claude is also
// installed, native Bash is already redirected to skyline_run, so the
// skycastle CLI would arrive via skyline_run's argv).
//
// Detection is precise to avoid false positives:
//   - `argv` arrays are inspected STRUCTURALLY: basename(argv[0]) must be
//     skycastle and the first non-flag token must be a redirected subcommand.
//     (So `grep "skycastle secrets"` — a search pattern — is NOT mistaken for
//     a command.) `sh -c "<script>"` argv falls back to shell-string scanning.
//   - Plain shell strings (Bash.command) are regex-scanned at command position
//     only (not inside a quoted argument).
//
// Only the secret-read/export verbs with a clear MCP equivalent are blocked;
// pure-ops verbs (login/unseal/seal/token/kms/certificates/ssh/pam/scan/
// console/ops/audit/run/whoami) pass through untouched.
//
// FAIL-OPEN: if the skycastle MCP daemon (:8210) is NOT up, the MCP tools are
// not available and the CLI is the only option, so we allow it (exit 0). Any
// parse problem or non-skycastle command also exits 0.

const http = require("http");

const REDIRECT = new Set(["secrets", "export"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);

// skycastle CLI subcommand -> the MCP tool(s) to use instead.
const MAP = {
  secrets:
    "the skycastle MCP secret tools (secret get/set/list/delete, versions, tags)",
  export:
    "the skycastle MCP secret tools to read or list secrets instead of exporting via the CLI",
};

function basename(p) {
  return String(p).split(/[\/\\]/).pop();
}

// Command position only: start, whitespace, ; & | ( backtick, or a path slash.
// Quotes are deliberately excluded so a quoted search pattern does not match.
const SHELL_RE =
  /(?:^|[\s;&|`(/])skycastle\s+(secrets|export)\b/;

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
  if (prog === "skycastle") {
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
    "Use the skycastle MCP tools, not the `skycastle " +
    sub +
    "` CLI — the CLI bypasses the vault MCP tools you should be using. " +
    "For `skycastle " +
    sub +
    "`, use " +
    (MAP[sub] || "the equivalent skycastle MCP tool") +
    ". If the skycastle MCP tools are not loaded, run " +
    'ToolSearch("select:mcp__skycastle__secret_get,mcp__skycastle__secret_set,mcp__skycastle__secret_list,mcp__skycastle__secret_delete") ' +
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

  // Only enforce while the skycastle MCP daemon is up; otherwise the CLI is
  // the only working path, so allow it (fail open).
  const req = http.get(
    { host: "127.0.0.1", port: 8210, path: "/mcp", timeout: 1000 },
    (res) => {
      res.resume();
      block(sub);
    }
  );
  req.on("timeout", () => req.destroy());
  req.on("error", () => process.exit(0)); // skycastle MCP down -> allow CLI
});
