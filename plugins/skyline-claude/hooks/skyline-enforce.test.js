// node:test for skyline-enforce.js hardening (binary-skyline#549).
// Run with: node --test plugins/skyline-claude/hooks/skyline-enforce.test.js
// Covers: daemon-down passthrough (notice + exit0), second-denial one-liner,
// sub-threshold silence (no output), normal deny path (full on first, exit2).
// Uses env overrides for daemon addr (matches existing test pattern style using env).
// Self-contained; cleans its marker files.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOOK = path.resolve(__dirname, "skyline-enforce.js");

const UP_PORT = 17333; // dedicated free port for dummy daemon in up tests (use python server to ensure child reachability)

function getMarker(sess) {
  const key = String(sess).replace(/[^a-z0-9_-]/gi, "_");
  return path.join(os.tmpdir(), `skyline-enforce-session-${key}.marker`);
}

let pyServer = null;
let testPort = 0; // will be set to UP_PORT once python dummy is ready

before(async () => {
  // clean markers used in tests
  ["sess-down", "sess-up1", "sess-up2", "sess-small", "sess-normal"].forEach((s) => {
    try { fs.rmSync(getMarker(s), { force: true }); } catch {}
  });

  // Use python dummy server (not node http) on fixed port because node-http servers started
  // from the test process are unreachable from its node children in this env. Python server
  // is reachable by curl/node children (verified). Start bg, wait for READY.
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
    httpd = socketserver.TCPServer(("127.0.0.1", port), H)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    print("READY " + str(port), flush=True)
    sys.stdin.read()  # block until closed
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
    pyServer.stderr.on("data", (d) => { /* ignore */ });
    pyServer.on("error", reject);
    setTimeout(() => reject(new Error("python dummy server failed to start")), 3000);
  });
  testPort = UP_PORT;
});

after(() => {
  if (pyServer) {
    try { pyServer.stdin.end(); } catch {}
    pyServer.kill("SIGKILL");
  }
  ["sess-down", "sess-up1", "sess-up2", "sess-small", "sess-normal"].forEach((s) => {
    try { fs.rmSync(getMarker(s), { force: true }); } catch {}
  });
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

test("daemon-down passthrough: notice on stderr, exit 0, no block", () => {
  const res = runHook("bash", { SKYLINE_DAEMON_PORT: "19999", CLAUDE_SESSION_ID: "sess-down" }, {
    tool_input: { command: "ls -la /some/long/path/that/is/over/threshold/or/has/pipe|but/for/down/we/force" }
  });
  assert.equal(res.status, 0, `exit code was ${res.status}`);
  assert.match(res.stderr, /skyline daemon unreachable/, "notice emitted");
  assert.ok(res.stderr.includes("allowing native tool"), "notice is the passthrough one");
  assert.equal(res.stdout, "", "no stdout");
});

test("sub-threshold silence: short cmd no pipe/redirect => exit 0, no output at all", () => {
  // even with daemon "up", short no-special chars => silent allow
  const shortCmd = "ls -1";
  assert.ok(shortCmd.length < 120, "test cmd is sub");
  const res = runHook("bash", { CLAUDE_SESSION_ID: "sess-small" }, {
    tool_input: { command: shortCmd }
  });
  assert.equal(res.status, 0);
  assert.equal(res.stderr, "");
  assert.equal(res.stdout, "");
});

test("second-denial one-liner (same session)", () => {
  const sess = "sess-up1";
  const longish = "cat package.json | head -5"; // has | so not skipped; >119? no but | prevents threshold
  // first denial: full guidance
  const r1 = runHook("bash", { CLAUDE_SESSION_ID: sess }, {
    tool_input: { command: longish }
  });
  assert.equal(r1.status, 2);
  assert.match(r1.stderr, /Skyline is active/, "first shows full redirect guidance");
  assert.ok(!r1.stderr.includes("full guidance shown once"), "first not the one-liner");

  // second in same session: one line
  const r2 = runHook("bash", { CLAUDE_SESSION_ID: sess }, {
    tool_input: { command: longish }
  });
  assert.equal(r2.status, 2);
  assert.match(r2.stderr, /Skyline redirect \(full guidance shown once per session\)/, "repeat is one-liner");
  assert.ok(!r2.stderr.includes("Skyline is active"), "repeat does not repeat full");
});

test("normal deny unchanged: non-bash or large, daemon up => full msg + exit 2 (first time)", () => {
  const sess = "sess-normal";
  const r = runHook("read", { CLAUDE_SESSION_ID: sess }, {
    tool_input: { file_path: "/tmp/whatever.txt" }
  });
  assert.equal(r.status, 2, "normal deny exits 2");
  assert.match(r.stderr, /skyline_read replaces Read/, "full message for the mode");
  assert.match(r.stderr, /ToolSearch/, "includes the switch instruction");
  assert.ok(!r.stderr.includes("full guidance shown once"), "first time is full");
});

test("bash long command without pipe still triggers when >=120 or has special? wait covered by prior", () => {
  // extra: a bash with no pipe but long enough to not skip
  const longNoPipe = "echo " + "x".repeat(130);
  const res = runHook("bash", { CLAUDE_SESSION_ID: "sess-up2" }, {
    tool_input: { command: longNoPipe }
  });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /skyline.*replace Bash/, "long bash triggers full when first");
});
