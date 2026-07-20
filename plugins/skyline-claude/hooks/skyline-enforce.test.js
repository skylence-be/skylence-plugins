// node:test for skyline-enforce.js (#549 daemon/threshold + #706 replacement guidance).
// Run with: node --test plugins/skyline-claude/hooks/skyline-enforce.test.js
//
// #706 acceptance matrix:
//   - every denial carries exact substitute (git diff / grep -rli / cat / Read / Write)
//   - out-of-tree Write/Read pass through
//   - "full guidance shown once per session" one-liner is GONE
//   - ToolSearch select string on every denial
//   - second denial still carries substitute (idempotent)
// Keeps: daemon-down passthrough, sub-threshold silence.
// Self-contained; cleans its marker files.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOOK = path.resolve(__dirname, "skyline-enforce.js");
// Ephemeral port to avoid clashes with parallel hook suites / leftover dummies.
const UP_PORT = 18000 + (process.pid % 1000);

function getReminderMarker(sess) {
  const key = String(sess).replace(/[^a-z0-9_-]/gi, "_");
  return path.join(os.tmpdir(), `skyline-enforce-reminder-${key}.marker`);
}

// legacy marker name from pre-#706 throttle — clean if present so old runs don't leak
function getLegacyMarker(sess) {
  const key = String(sess).replace(/[^a-z0-9_-]/gi, "_");
  return path.join(os.tmpdir(), `skyline-enforce-session-${key}.marker`);
}

const SESSIONS = [
  "sess-down",
  "sess-up1",
  "sess-up2",
  "sess-small",
  "sess-normal",
  "sess-grep-php",
  "sess-grep-config",
  "sess-git-diff",
  "sess-grep-rli",
  "sess-cat",
  "sess-write-out",
  "sess-write-in",
  "sess-read-in",
  "sess-idempotent",
  "sess-toolsearch",
  "sess-compound",
  "sess-env-unset",
  "sess-find-name",
  "sess-glob-mode",
  "sess-edit-in",
  "sess-marker-order",
  "sess-grep-flagval",
  "sess-ls-abs",
];

function cleanMarkers() {
  for (const s of SESSIONS) {
    try {
      fs.rmSync(getReminderMarker(s), { force: true });
    } catch {}
    try {
      fs.rmSync(getLegacyMarker(s), { force: true });
    } catch {}
  }
}

let pyServer = null;
let testPort = 0;

before(async () => {
  cleanMarkers();

  const pyCode = `
import http.server, socketserver, threading, sys
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")
    def log_message(self, *a): pass
port = ${UP_PORT}
try:
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", port), H)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    print("READY " + str(port), flush=True)
    sys.stdin.read()
except Exception as e:
    print("ERR", e, flush=True)
    sys.exit(1)
`;
  pyServer = spawn("python3", ["-c", pyCode], { stdio: ["pipe", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    let buf = "";
    const ondata = (d) => {
      buf += d.toString();
      if (buf.includes("READY")) {
        pyServer.stdout.removeListener("data", ondata);
        resolve();
      }
    };
    pyServer.stdout.on("data", ondata);
    pyServer.stderr.on("data", () => {});
    pyServer.on("error", reject);
    setTimeout(() => reject(new Error("python dummy server failed to start")), 3000);
  });
  testPort = UP_PORT;
});

after(() => {
  if (pyServer) {
    try {
      pyServer.stdin.end();
    } catch {}
    pyServer.kill("SIGKILL");
  }
  cleanMarkers();
});

function runHook(mode, envExtra = {}, stdinJson = null) {
  const env = {
    ...process.env,
    SKYLINE_DAEMON_HOST: "127.0.0.1",
    SKYLINE_DAEMON_PORT: String(testPort || 19999),
    ...envExtra,
  };
  const opts = {
    cwd: __dirname,
    env,
    encoding: "utf8",
    input: stdinJson ? JSON.stringify(stdinJson) : undefined,
  };
  return spawnSync(process.execPath, [HOOK, mode], opts);
}

function assertNoDeadOneLiner(stderr) {
  assert.ok(
    !stderr.includes("full guidance shown once per session"),
    "dead one-liner must be gone"
  );
}

function assertHasToolSearch(stderr) {
  assert.match(stderr, /ToolSearch\("select:mcp__plugin_skyline-claude_skyline__/, "ToolSearch select present");
}

// --- retained #549 behaviors ----------------------------------------------

test("daemon-down passthrough: notice on stderr, exit 0, no block", () => {
  const res = runHook(
    "bash",
    { SKYLINE_DAEMON_PORT: "19999", CLAUDE_SESSION_ID: "sess-down" },
    {
      tool_input: {
        command:
          "ls -la /some/long/path/that/is/over/threshold/or/has/pipe|but/for/down/we/force",
      },
    }
  );
  assert.equal(res.status, 0, `exit code was ${res.status}`);
  assert.match(res.stderr, /skyline daemon unreachable/, "notice emitted");
  assert.ok(res.stderr.includes("allowing native tool"), "notice is the passthrough one");
  assert.equal(res.stdout, "", "no stdout");
});

test("sub-threshold silence: short cmd no pipe/redirect => exit 0, no output at all", () => {
  const shortCmd = "ls -1";
  assert.ok(shortCmd.length < 120, "test cmd is sub");
  const res = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-small" },
    { tool_input: { command: shortCmd } }
  );
  assert.equal(res.status, 0);
  assert.equal(res.stderr, "");
  assert.equal(res.stdout, "");
});

// --- #706: substitute on every denial -------------------------------------
// Size threshold (#549) still skips short bash with no pipe/redirect. Matrix
// commands use a pipe or length >=120 so they are actually denied; mapping
// always uses the first pipeline stage / leading argv.

test("#706 git diff => skyline_git({subcommand:\"diff\"}) on every denial", () => {
  // pipe defeats size threshold; first stage still maps to git diff
  const r = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-git-diff" },
    { tool_input: { command: "git diff | cat" } }
  );
  assert.equal(r.status, 2, "denied");
  assert.match(r.stderr, /skyline_git\(\{subcommand:"diff"\}\)/, "exact substitute");
  assertHasToolSearch(r.stderr);
  assertNoDeadOneLiner(r.stderr);
});

test("#706 git diff long form (>=120 chars): substitute present", () => {
  const long = "git diff " + "a".repeat(120);
  const r = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-up2" },
    { tool_input: { command: long } }
  );
  assert.equal(r.status, 2);
  assert.match(r.stderr, /skyline_git\(\{subcommand:"diff"\}\)/);
  assertHasToolSearch(r.stderr);
  assertNoDeadOneLiner(r.stderr);
});

test("#706 grep -rli pattern => skyline_grep({pattern})", () => {
  // pipe so size threshold does not skip
  const r = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-grep-rli" },
    { tool_input: { command: "grep -rli 'Meting' . | head -20" } }
  );
  assert.equal(r.status, 2);
  assert.match(r.stderr, /skyline_grep\(\{pattern:"Meting"\}\)/, "pattern mapped");
  assertHasToolSearch(r.stderr);
  assertNoDeadOneLiner(r.stderr);
});

test("#706 cat file => skyline_read({path})", () => {
  const r = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-cat" },
    { tool_input: { command: "cat src/App/Models/User.php | head -50" } }
  );
  assert.equal(r.status, 2);
  assert.match(
    r.stderr,
    /skyline_read\(\{path:"src\/App\/Models\/User\.php"\}\)/,
    "path mapped from cat"
  );
  assertHasToolSearch(r.stderr);
  assertNoDeadOneLiner(r.stderr);
});

test("#706 Read inside tree => deny with skyline_read({path})", () => {
  // hooks dir is inside the plugins repo tree
  const inside = path.join(__dirname, "skyline-enforce.js");
  const r = runHook(
    "read",
    { CLAUDE_SESSION_ID: "sess-read-in", CLAUDE_PROJECT_DIR: path.resolve(__dirname, "../../..") },
    {
      cwd: path.resolve(__dirname, "../../.."),
      tool_input: { file_path: inside },
    }
  );
  assert.equal(r.status, 2, "in-tree Read denied");
  assert.match(r.stderr, /skyline_read\(\{path:/);
  assert.ok(r.stderr.includes(inside) || r.stderr.includes("skyline_read"), "path or tool present");
  assertHasToolSearch(r.stderr);
  assertNoDeadOneLiner(r.stderr);
});

test("#706 Write outside tree (e.g. ~/.claude) => pass through exit 0", () => {
  const outside = path.join(os.homedir(), ".claude", "memory", "foo.md");
  const r = runHook(
    "edit",
    { CLAUDE_SESSION_ID: "sess-write-out", CLAUDE_PROJECT_DIR: path.resolve(__dirname, "../../..") },
    {
      cwd: path.resolve(__dirname, "../../.."),
      tool_name: "Write",
      tool_input: { file_path: outside, content: "x" },
    }
  );
  assert.equal(r.status, 0, "out-of-tree Write must pass");
  assert.equal(r.stderr, "", "no deny noise for out-of-tree");
});

test("#706 Write inside tree => deny with skyline_create({path})", () => {
  const inside = path.join(__dirname, "NEWFILE-enforce-test.txt");
  const r = runHook(
    "edit",
    { CLAUDE_SESSION_ID: "sess-write-in", CLAUDE_PROJECT_DIR: path.resolve(__dirname, "../../..") },
    {
      cwd: path.resolve(__dirname, "../../.."),
      tool_name: "Write",
      tool_input: { file_path: inside, content: "hello" },
    }
  );
  assert.equal(r.status, 2, "in-tree Write denied");
  assert.match(r.stderr, /skyline_create\(\{path:/, "Write maps to skyline_create");
  assertHasToolSearch(r.stderr);
  assertNoDeadOneLiner(r.stderr);
});

test("#706 second denial still carries substitute (idempotent, no dead one-liner)", () => {
  const sess = "sess-idempotent";
  const cmd = { tool_input: { command: "grep -rli 'foo' . | head -5" } };
  const r1 = runHook("bash", { CLAUDE_SESSION_ID: sess }, cmd);
  const r2 = runHook("bash", { CLAUDE_SESSION_ID: sess }, cmd);
  assert.equal(r1.status, 2);
  assert.equal(r2.status, 2);
  assert.match(r1.stderr, /skyline_grep\(\{pattern:"foo"\}\)/);
  assert.match(r2.stderr, /skyline_grep\(\{pattern:"foo"\}\)/, "repeat still has substitute");
  assertHasToolSearch(r1.stderr);
  assertHasToolSearch(r2.stderr);
  assertNoDeadOneLiner(r1.stderr);
  assertNoDeadOneLiner(r2.stderr);
  // field #11: second may collapse long reminder, but substitute stays
  assert.ok(!r2.stderr.includes("full guidance shown once"), "no legacy one-liner");
});

test("#706 ToolSearch select string unconditional on read deny", () => {
  const inside = path.join(__dirname, "skyline-enforce.js");
  const r = runHook(
    "read",
    {
      CLAUDE_SESSION_ID: "sess-toolsearch",
      CLAUDE_PROJECT_DIR: path.resolve(__dirname, "../../.."),
    },
    {
      cwd: path.resolve(__dirname, "../../.."),
      tool_input: { file_path: inside },
    }
  );
  assert.equal(r.status, 2);
  assertHasToolSearch(r.stderr);
  assert.match(
    r.stderr,
    /mcp__plugin_skyline-claude_skyline__skyline_git/,
    "CORE menu includes skyline_git"
  );
});

// --- retained symbol-hunt steering ----------------------------------------

function markerDir(file) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "enforce-marker-"));
  fs.writeFileSync(path.join(d, file), "{}");
  return d;
}
function cleanup(d) {
  try {
    fs.rmSync(d, { recursive: true, force: true });
  } catch {}
}

test("native Grep redirect with `use App\\Models\\User` in a composer cwd: message contains `skyline_symbol_card`", () => {
  const sess = "sess-grep-php";
  const php = markerDir("composer.json");
  try {
    const r = runHook(
      "grep",
      { CLAUDE_SESSION_ID: sess },
      {
        cwd: php,
        tool_input: { pattern: "use App\\Models\\User" },
      }
    );
    assert.equal(r.status, 2, "still denies (redirects)");
    assert.match(r.stderr, /skyline_grep\(\{pattern:/, "substitute present");
    assert.match(
      r.stderr,
      /skyline_symbol_card/,
      "steering or PHP note mentions symbol_card"
    );
    assertNoDeadOneLiner(r.stderr);
  } finally {
    cleanup(php);
  }
});

test("native Grep redirect with a config-key pattern: base substitute, no Symbol hunt sentence", () => {
  const sess = "sess-grep-config";
  const r = runHook(
    "grep",
    { CLAUDE_SESSION_ID: sess },
    {
      tool_input: { pattern: "some config key with spaces" },
    }
  );
  assert.equal(r.status, 2);
  assert.match(r.stderr, /skyline_grep\(\{pattern:"some config key with spaces"\}\)/);
  assert.ok(!r.stderr.includes("Symbol hunt?"), "no steering sentence for non-symbol pattern");
  assertHasToolSearch(r.stderr);
});

test("bash long command without pipe still triggers when >=120", () => {
  const longNoPipe = "echo " + "x".repeat(130);
  const res = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-normal" },
    { tool_input: { command: longNoPipe } }
  );
  assert.equal(res.status, 2);
  assert.match(
    res.stderr,
    /skyline_run\(\{argv:\["sh","-c","echo x/,
    "long bash maps to argv-shape skyline_run"
  );
  assertHasToolSearch(res.stderr);
});

// --- bounce cycle 1 (todo 401): schema-valid substitutes + scoping ---------

test("#706 echo-headed `;`-compound => argv-shape skyline_run substitute", () => {
  const r = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-compound" },
    { tool_input: { command: "echo prep; git diff boost.json | head -20" } }
  );
  assert.equal(r.status, 2);
  assert.match(
    r.stderr,
    /skyline_run\(\{argv:\["sh","-c","echo prep; git diff boost\.json \| head -20"\]\}\)/,
    "whole line wrapped in sh -c argv"
  );
  assert.ok(!r.stderr.includes("skyline_run({command:"), "no schema-invalid command param");
  assertHasToolSearch(r.stderr);
  assertNoDeadOneLiner(r.stderr);
});

test("#706 CLAUDE_PROJECT_DIR unset: .git walk scopes, in-tree Read still denied", () => {
  const inside = path.join(__dirname, "skyline-enforce.js");
  const r = runHook(
    "read",
    {
      CLAUDE_SESSION_ID: "sess-env-unset",
      // undefined values are omitted from the child env (Node >= 12)
      CLAUDE_PROJECT_DIR: undefined,
      SKYLINE_PROJECT_ROOT: undefined,
    },
    { cwd: __dirname, tool_input: { file_path: inside } }
  );
  assert.equal(r.status, 2, "env-unset in-tree Read denied via .git walk");
  assert.match(r.stderr, /skyline_read\(\{path:/);
  assertHasToolSearch(r.stderr);
});

test("#706 find -name => skyline_find({glob,path})", () => {
  const r = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-find-name" },
    { tool_input: { command: "find . -name '*.php' | head -50" } }
  );
  assert.equal(r.status, 2);
  assert.match(
    r.stderr,
    /skyline_find\(\{glob:"\*\.php", path:"\/[^"]+"\}\)/,
    "find -name keeps the glob param and renders an ABSOLUTE path (never relative '.')"
  );
  assert.ok(!r.stderr.includes('path:"."'), "#411 no relative '.' path in remediation");
  assert.ok(!r.stderr.includes("skyline_find({pattern:"), "no schema-invalid pattern param");
});

test("#411 ls remediation renders an absolute path, never a relative '.'", () => {
  const r = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-ls-abs", CLAUDE_PROJECT_DIR: path.resolve(__dirname, "../../..") },
    { tool_input: { command: "ls -la | head -20" } }
  );
  assert.equal(r.status, 2);
  assert.ok(!r.stderr.includes('path:"."'), "no relative '.' path emitted");
  assert.match(
    r.stderr,
    /skyline_tree\(\{path:"\/[^"]+"\}\)/,
    "bare ls maps to skyline_tree with an ABSOLUTE path"
  );
});

test("#706 Glob => skyline_find({glob})", () => {
  const r = runHook(
    "glob",
    { CLAUDE_SESSION_ID: "sess-glob-mode" },
    { tool_input: { pattern: "**/*.js" } }
  );
  assert.equal(r.status, 2);
  assert.match(r.stderr, /skyline_find\(\{glob:"\*\*\/\*\.js"\}\)/, "Glob maps to glob param");
  assert.ok(!r.stderr.includes("skyline_find({pattern:"), "no schema-invalid pattern param");
});

test("#706 Edit inside tree => read-then-edit flow (skyline_edit has no path param)", () => {
  const inside = path.join(__dirname, "skyline-enforce.js");
  const r = runHook(
    "edit",
    {
      CLAUDE_SESSION_ID: "sess-edit-in",
      CLAUDE_PROJECT_DIR: path.resolve(__dirname, "../../.."),
    },
    {
      cwd: path.resolve(__dirname, "../../.."),
      tool_name: "Edit",
      tool_input: { file_path: inside, old_string: "a", new_string: "b" },
    }
  );
  assert.equal(r.status, 2, "in-tree Edit denied");
  assert.match(r.stderr, /skyline_read\(\{path:/, "flow starts with skyline_read");
  assert.match(r.stderr, /then skyline_edit with the returned ¶path#TAG anchor/, "honest flow");
  assert.ok(!r.stderr.includes("skyline_edit({path:"), "no schema-invalid path param");
});

test("field #11: non-symbol denial does not burn the steer marker", () => {
  const sess = "sess-marker-order";
  const r1 = runHook(
    "bash",
    { CLAUDE_SESSION_ID: sess },
    { tool_input: { command: "git diff | cat" } }
  );
  assert.equal(r1.status, 2);
  assert.ok(!r1.stderr.includes("Symbol hunt?"), "git diff is not a symbol hunt");
  const r2 = runHook(
    "grep",
    { CLAUDE_SESSION_ID: sess },
    { tool_input: { pattern: "use App\\Models\\User" } }
  );
  assert.equal(r2.status, 2);
  assert.match(r2.stderr, /Symbol hunt\?/, "first symbol-hunt denial still steers");
  assert.ok(
    !r2.stderr.includes("reminder omitted"),
    "marker not burned by earlier non-symbol denial"
  );
  const r3 = runHook(
    "grep",
    { CLAUDE_SESSION_ID: sess },
    { tool_input: { pattern: "use App\\Models\\User" } }
  );
  assert.equal(r3.status, 2);
  assert.match(r3.stderr, /reminder omitted/, "second symbol-hunt denial collapses");
  assert.match(r3.stderr, /skyline_grep\(\{pattern:/, "substitute never drops");
});

test("grep flag values are not taken as the pattern", () => {
  const r1 = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-grep-flagval" },
    { tool_input: { command: "grep -A 3 foo . | head" } }
  );
  assert.equal(r1.status, 2);
  assert.match(r1.stderr, /skyline_grep\(\{pattern:"foo"\}\)/, "-A value skipped");
  const r2 = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-grep-flagval" },
    { tool_input: { command: "grep --exclude-dir node_modules foo . | head" } }
  );
  assert.equal(r2.status, 2);
  assert.match(r2.stderr, /skyline_grep\(\{pattern:"foo"\}\)/, "--exclude-dir value skipped");
});
