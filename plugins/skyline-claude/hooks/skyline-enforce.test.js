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
  "sess-lifecycle",
  "sess-lifecycle-narrow",
  "sess-lifecycle-grep",
  "sess-lifecycle-down",
  "sess-env-inspect",
  "sess-env-narrow-exec",
  "sess-env-narrow-flag",
  "sess-env-narrow-grep",
  "sess-env-down",
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
  const pyCmd = process.platform === "win32" ? "python" : "python3";
  pyServer = spawn(pyCmd, ["-c", pyCode], { stdio: ["pipe", "pipe", "pipe"] });
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
  assert.match(stderr, /ToolSearch\("select:mcp__skyline__/, "ToolSearch select present");
  // Both wire spellings must be offered: `select:` is exact-name matching, so
  // a single hardcoded prefix resolves ZERO tools on a client that namespaces
  // the server the other way (skylence-plugins#41). Asserting only one
  // spelling is what let that ship.
  assert.match(
    stderr,
    /select:[^"]*mcp__plugin_skyline-claude_skyline__read/,
    "plugin-namespaced spelling present"
  );
  assert.match(
    stderr,
    /select:[^"]*mcp__skyline__read/,
    "bare-server spelling present"
  );
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

test("#706 git diff => git({subcommand:\"diff\"}) on every denial", () => {
  // pipe defeats size threshold; first stage still maps to git diff
  const r = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-git-diff" },
    { tool_input: { command: "git diff | cat" } }
  );
  assert.equal(r.status, 2, "denied");
  assert.match(r.stderr, /git\(\{subcommand:"diff"\}\)/, "exact substitute");
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
  assert.match(r.stderr, /git\(\{subcommand:"diff"\}\)/);
  assertHasToolSearch(r.stderr);
  assertNoDeadOneLiner(r.stderr);
});

test("#706 grep -rli pattern => grep({pattern})", () => {
  // pipe so size threshold does not skip
  const r = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-grep-rli" },
    { tool_input: { command: "grep -rli 'Meting' . | head -20" } }
  );
  assert.equal(r.status, 2);
  assert.match(r.stderr, /grep\(\{pattern:"Meting"\}\)/, "pattern mapped");
  assertHasToolSearch(r.stderr);
  assertNoDeadOneLiner(r.stderr);
});

test("#706 cat file => read({path})", () => {
  const r = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-cat" },
    { tool_input: { command: "cat src/App/Models/User.php | head -50" } }
  );
  assert.equal(r.status, 2);
  assert.match(
    r.stderr,
    /read\(\{path:"\/[^"]+src\/App\/Models\/User\.php"\}\)/,
    "#415 F2: cat maps to read with an ABSOLUTE path"
  );
  assert.ok(!r.stderr.includes('path:"src/'), "no relative path in cat remediation");
  assertHasToolSearch(r.stderr);
  assertNoDeadOneLiner(r.stderr);
});

test("#706 Read inside tree => deny with read({path})", () => {
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
  assert.match(r.stderr, /read\(\{path:/);
  assert.ok(r.stderr.includes(inside) || r.stderr.includes("read"), "path or tool present");
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

// --- workspace-copy containment (field report 2026-08-01) ------------------
// A skyrift/skyline workspace copy is a SIBLING of the repo
// (`<repo>-workspaces/<name>`), so it fails the root-prefix test — but it is
// code, and it used to slip through the ~/.claude carve-out unsteered while
// every Bash call in the same session was steered. The skyline-first mandate
// follows the FILE, not the session cwd.

test("Write into a sibling workspace copy (.skyrift-workspace marker) => deny", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "enforce-wscopy-"));
  try {
    const probe = path.join(base, "repo-workspaces", "probe");
    fs.mkdirSync(path.join(probe, "src"), { recursive: true });
    fs.writeFileSync(path.join(probe, ".skyrift-workspace"), "");
    const target = path.join(probe, "src", "x.php");
    const r = runHook(
      "edit",
      { CLAUDE_SESSION_ID: "sess-wscopy", CLAUDE_PROJECT_DIR: path.resolve(__dirname, "../../..") },
      {
        cwd: path.resolve(__dirname, "../../.."),
        tool_name: "Write",
        tool_input: { file_path: target, content: "x" },
      }
    );
    assert.equal(r.status, 2, "workspace-copy Write must be steered, not exempted");
    assert.match(r.stderr, /create\(\{path:/);
    assertHasToolSearch(r.stderr);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("Write into some other git tree => deny (mandate follows the file)", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "enforce-othergit-"));
  try {
    fs.mkdirSync(path.join(base, ".git"), { recursive: true });
    const target = path.join(base, "y.rs");
    const r = runHook(
      "edit",
      { CLAUDE_SESSION_ID: "sess-othergit", CLAUDE_PROJECT_DIR: path.resolve(__dirname, "../../..") },
      {
        cwd: path.resolve(__dirname, "../../.."),
        tool_name: "Write",
        tool_input: { file_path: target, content: "x" },
      }
    );
    assert.equal(r.status, 2, "any-code-tree Write must be steered");
    assert.match(r.stderr, /create\(\{path:/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("Write to a non-repo scratch path still passes through", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "enforce-scratch-"));
  try {
    const target = path.join(base, "note.txt");
    const r = runHook(
      "edit",
      { CLAUDE_SESSION_ID: "sess-scratch", CLAUDE_PROJECT_DIR: path.resolve(__dirname, "../../..") },
      {
        cwd: path.resolve(__dirname, "../../.."),
        tool_name: "Write",
        tool_input: { file_path: target, content: "x" },
      }
    );
    assert.equal(r.status, 0, "genuinely non-code destination must still pass");
    assert.equal(r.stderr, "", "no deny noise for scratch");
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("#706 Write inside tree => deny with create({path})", () => {
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
  assert.match(r.stderr, /create\(\{path:/, "Write maps to create");
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
  assert.match(r1.stderr, /grep\(\{pattern:"foo"\}\)/);
  assert.match(r2.stderr, /grep\(\{pattern:"foo"\}\)/, "repeat still has substitute");
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
    /mcp__skyline__git/,
    "CORE menu includes git"
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

test("native Grep redirect with `use App\\Models\\User` in a composer cwd: message contains `symbol_card`", () => {
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
    assert.match(r.stderr, /grep\(\{pattern:/, "substitute present");
    assert.match(
      r.stderr,
      /symbol_card/,
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
  assert.match(r.stderr, /grep\(\{pattern:"some config key with spaces"\}\)/);
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
    /run\(\{argv:\["sh","-c","echo x/,
    "long bash maps to argv-shape run"
  );
  assertHasToolSearch(res.stderr);
});

// --- bounce cycle 1 (todo 401): schema-valid substitutes + scoping ---------

test("#706 echo-headed `;`-compound => argv-shape run substitute", () => {
  const r = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-compound" },
    { tool_input: { command: "echo prep; git diff boost.json | head -20" } }
  );
  assert.equal(r.status, 2);
  assert.match(
    r.stderr,
    /run\(\{argv:\["sh","-c","echo prep; git diff boost\.json \| head -20"\]\}\)/,
    "whole line wrapped in sh -c argv"
  );
  assert.ok(!r.stderr.includes("run({command:"), "no schema-invalid command param");
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
  assert.match(r.stderr, /read\(\{path:/);
  assertHasToolSearch(r.stderr);
});

test("#706 find -name => find({glob,path})", () => {
  const r = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-find-name" },
    { tool_input: { command: "find . -name '*.php' | head -50" } }
  );
  assert.equal(r.status, 2);
  assert.match(
    r.stderr,
    /find\(\{glob:"\*\.php", path:"\/[^"]+"\}\)/,
    "find -name keeps the glob param and renders an ABSOLUTE path (never relative '.')"
  );
  assert.ok(!r.stderr.includes('path:"."'), "#411 no relative '.' path in remediation");
  assert.ok(!r.stderr.includes("find({pattern:"), "no schema-invalid pattern param");
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
    /tree\(\{path:"\/[^"]+"\}\)/,
    "bare ls maps to tree with an ABSOLUTE path"
  );
});

test("#706 Glob => find({glob})", () => {
  const r = runHook(
    "glob",
    { CLAUDE_SESSION_ID: "sess-glob-mode" },
    { tool_input: { pattern: "**/*.js" } }
  );
  assert.equal(r.status, 2);
  assert.match(r.stderr, /find\(\{glob:"\*\*\/\*\.js"\}\)/, "Glob maps to glob param");
  assert.ok(!r.stderr.includes("find({pattern:"), "no schema-invalid pattern param");
});

test("#706 Edit inside tree => read-then-edit flow (edit has no path param)", () => {
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
  assert.match(r.stderr, /read\(\{path:/, "flow starts with read");
  assert.match(r.stderr, /then edit with the returned ¶path#TAG anchor/, "honest flow");
  assert.ok(!r.stderr.includes("edit({path:"), "no schema-invalid path param");
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
  assert.match(r3.stderr, /grep\(\{pattern:/, "substitute never drops");
});

test("grep flag values are not taken as the pattern", () => {
  const r1 = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-grep-flagval" },
    { tool_input: { command: "grep -A 3 foo . | head" } }
  );
  assert.equal(r1.status, 2);
  assert.match(r1.stderr, /grep\(\{pattern:"foo"\}\)/, "-A value skipped");
  const r2 = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-grep-flagval" },
    { tool_input: { command: "grep --exclude-dir node_modules foo . | head" } }
  );
  assert.equal(r2.status, 2);
  assert.match(r2.stderr, /grep\(\{pattern:"foo"\}\)/, "--exclude-dir value skipped");
});

// --- daemon lifecycle pass-through (L4 hook friction, 2026-07-21) ----------
// Regression: the hook rewrote `skyline daemon restart` into run(...),
// i.e. restart the daemon through the daemon being restarted. Every command
// below is >=120 chars or contains a pipe, so isSubThreshold() cannot be the
// reason it passes: only the lifecycle exemption can be.

const LIFECYCLE_CASES = [
  [
    "restart with follow-up stages",
    "/Users/jv/.local/bin/skyline daemon restart --port 7333 && sleep 3 && " +
      "/Users/jv/.local/bin/skyline daemon status --port 7333 && curl -sS http://127.0.0.1:7333/health",
  ],
  ["kill-all through a pipe", "skyline daemon kill-all | tee /tmp/killall.log"],
  [
    "sh -c wrapped restart",
    'sh -c "cd /Users/jv && /Users/jv/.local/bin/skyline daemon restart --port 7333 --verbose" ; ' +
      "echo done-restarting-the-daemon-now-for-real",
  ],
  [
    "lifecycle verb in a later stage",
    "echo restarting the skyline service now for recovery purposes after the crash && " +
      "sleep 1 && skyline daemon restart --port 7333 --verbose",
  ],
  [
    "install with a flag before the verb",
    "/usr/local/bin/skyline daemon --port 7333 install --label com.skylence.skyline.daemon " +
      "--log /tmp/skyline-daemon-install.log --force",
  ],
];

for (const [label, command] of LIFECYCLE_CASES) {
  test(`daemon lifecycle passes through: ${label}`, () => {
    assert.ok(
      command.length >= 120 || /[|><]/.test(command),
      "case must defeat the size threshold, else it proves nothing"
    );
    const r = runHook(
      "bash",
      { CLAUDE_SESSION_ID: "sess-lifecycle" },
      { tool_input: { command } }
    );
    assert.equal(r.status, 0, `must not block; stderr was: ${r.stderr}`);
    assert.ok(
      !r.stderr.includes("run("),
      "must never advise restarting the daemon through the daemon"
    );
    assert.match(r.stderr, /daemon lifecycle command/, "explicit pass-through notice");
  });
}

test("lifecycle exemption is narrow: daemon status still redirects", () => {
  const command =
    "/Users/jv/.local/bin/skyline daemon status --port 7333 --format json --verbose && " +
    "echo checking-the-daemon-status-here-right-now-ok";
  assert.ok(command.length >= 120, "case must defeat the size threshold");
  const r = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-lifecycle-narrow" },
    { tool_input: { command } }
  );
  assert.equal(r.status, 2, "status is a read, not lifecycle: still denied");
  assertHasToolSearch(r.stderr);
});

test("lifecycle exemption is narrow: grepping for the phrase still redirects", () => {
  // A regex over the raw command would wrongly exempt this; tokenizing does not.
  const r = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-lifecycle-grep" },
    {
      tool_input: {
        command:
          'grep -rn "skyline daemon restart" /Users/jv/Code/docs --include=*.md --color=never | head -40',
      },
    }
  );
  assert.equal(r.status, 2, "grep for the phrase is an ordinary search: denied");
  assert.match(r.stderr, /grep\(\{pattern:"skyline daemon restart"\}\)/);
});

test("daemon-down passthrough holds for a lifecycle command too", () => {
  // Belt and braces: recovery must work whether the probe port is live or dead.
  const r = runHook(
    "bash",
    { SKYLINE_DAEMON_PORT: "19999", CLAUDE_SESSION_ID: "sess-lifecycle-down" },
    {
      tool_input: {
        command:
          "skyline daemon restart --port 7333 --verbose | tee /tmp/skyline-restart-recovery.log",
      },
    }
  );
  assert.equal(r.status, 0, "never block recovery");
  assert.ok(!r.stderr.includes("run("), "no self-referential advice");
});

test("self-env-inspection passes through: bare env piped to a filter", () => {
  // The exact live-bug shape (field case 2026-08-01): a pipe defeats the size
  // threshold, so only the dedicated pass-through saves this from `run()`,
  // which would silently answer with the DAEMON's environment instead.
  const command = "env | grep -c HERDR_";
  assert.ok(/[|><]/.test(command), "case must defeat the size threshold, else it proves nothing");
  const r = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-env-inspect" },
    { tool_input: { command } }
  );
  assert.equal(r.status, 0, `must not block; stderr was: ${r.stderr}`);
  assert.ok(!r.stderr.includes("run("), "must never advise self-inspection through the daemon-routed run");
  assert.match(r.stderr, /environment self-inspection/, "explicit pass-through notice");
});

test("self-env-inspection passes through: printenv of a var, piped", () => {
  const command = "printenv HERDR_ENV | cat";
  assert.ok(/[|><]/.test(command), "case must defeat the size threshold, else it proves nothing");
  const r = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-env-inspect" },
    { tool_input: { command } }
  );
  assert.equal(r.status, 0, `must not block; stderr was: ${r.stderr}`);
  assert.match(r.stderr, /environment self-inspection/, "explicit pass-through notice");
});

test("self-env-inspection exemption is narrow: env with a real exec target still redirects", () => {
  const command = "env FOO=bar realcmd --flag | tee /tmp/skyline-env-exec-recovery.log";
  assert.ok(/[|><]/.test(command), "case must defeat the size threshold, else it proves nothing");
  const r = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-env-narrow-exec" },
    { tool_input: { command } }
  );
  assert.equal(r.status, 2, "env launching a real program is a genuine dispatch: still denied");
  assert.ok(!r.stderr.includes("environment self-inspection"), "must not be misclassified as a self-read");
});

// skylore mark 236: env's OWN flags (-i, -u NAME, --) were never walked
// before the naive exec-target check, so each of these three real-world
// program launches misclassified as a bare self-read and slipped past the
// redirect. Fixed by mirroring DAEMON_VALUE_FLAGS' flag-walking.
for (const [label, command] of [
  ["-i ignore-environment flag", "env -i whoami | tee /tmp/skyline-env-flag-i-recovery.log"],
  ["-u NAME value-taking flag", "env -u FOO realcmd | tee /tmp/skyline-env-flag-u-recovery.log"],
  ["-- end-of-options marker", "env -- realcmd | tee /tmp/skyline-env-flag-dashdash-recovery.log"],
]) {
  test(`self-env-inspection exemption is narrow: env ${label} with an exec target still redirects`, () => {
    assert.ok(/[|><]/.test(command), "case must defeat the size threshold, else it proves nothing");
    const r = runHook(
      "bash",
      { CLAUDE_SESSION_ID: "sess-env-narrow-flag" },
      { tool_input: { command } }
    );
    assert.equal(r.status, 2, "env launching a real program is a genuine dispatch: still denied");
    assert.ok(!r.stderr.includes("environment self-inspection"), "must not be misclassified as a self-read");
  });
}

test("self-env-inspection exemption is narrow: grepping for the word env still redirects", () => {
  // A regex over the raw command would wrongly exempt this; tokenizing does not.
  const r = runHook(
    "bash",
    { CLAUDE_SESSION_ID: "sess-env-narrow-grep" },
    {
      tool_input: {
        command: 'grep -rn "printenv HERDR_ENV" /Users/jv/Code/docs --include=*.md | head -5',
      },
    }
  );
  assert.equal(r.status, 2, "grep for the phrase is an ordinary search: denied");
  assert.match(r.stderr, /grep\(\{pattern:"printenv HERDR_ENV"\}\)/);
});

test("self-env-inspection passes through even with the daemon down", () => {
  // Mirrors the daemon-lifecycle parity test: this exemption fires before the
  // daemon-ready probe, so it must never depend on the daemon being up.
  const r = runHook(
    "bash",
    { SKYLINE_DAEMON_PORT: "19999", CLAUDE_SESSION_ID: "sess-env-down" },
    { tool_input: { command: "env | grep -c HERDR_" } }
  );
  assert.equal(r.status, 0, "never block a self-read on daemon-down either");
  assert.ok(!r.stderr.includes("run("), "no self-referential advice");
});
