// node:test for skycastle-enforce.js (Grok port)
// Run: node --test plugins/skycastle-grok/hooks/skycastle-enforce.test.js

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync, spawn } = require("child_process");
const path = require("path");

const HOOK = path.resolve(__dirname, "skycastle-enforce.js");
const UP_PORT = 18210 + (process.pid % 100);

let pyServer = null;

before(async () => {
  const pyCode = `
import http.server, socketserver, threading, sys
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.end_headers(); self.wfile.write(b"ok")
    def log_message(self, *a): pass
port = ${UP_PORT}
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(("127.0.0.1", port), H)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
print("READY", flush=True)
sys.stdin.read()
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
    setTimeout(() => reject(new Error("dummy skycastle server failed")), 3000);
  });
});

after(() => {
  if (pyServer) {
    try {
      pyServer.stdin.end();
    } catch {}
    pyServer.kill("SIGKILL");
  }
});

function run(stdinObj, port) {
  return spawnSync(process.execPath, [HOOK], {
    encoding: "utf8",
    input: JSON.stringify(stdinObj),
    env: {
      ...process.env,
      SKYCASTLE_DAEMON_HOST: "127.0.0.1",
      SKYCASTLE_DAEMON_PORT: String(port),
    },
  });
}

test("daemon down: secrets allows (fail-open)", () => {
  const res = run(
    { toolInput: { command: "skycastle secrets get FOO" } },
    19998
  );
  assert.equal(res.status, 0);
  assert.equal((res.stdout || "").trim(), "");
});

test("daemon up: secrets denies with secret tools reason", () => {
  const res = run(
    { toolInput: { command: "skycastle secrets get FOO" } },
    UP_PORT
  );
  assert.equal(res.status, 0);
  const j = JSON.parse((res.stdout || "").trim());
  assert.equal(j.decision, "deny");
  assert.match(j.reason, /secret/);
});

test("daemon up: export denies", () => {
  const res = run({ toolInput: { command: "skycastle export" } }, UP_PORT);
  assert.equal(res.status, 0);
  const j = JSON.parse((res.stdout || "").trim());
  assert.equal(j.decision, "deny");
});

test("daemon up: skyline run argv secrets denies", () => {
  const res = run(
    { tool_input: { argv: ["skycastle", "secrets", "list"] } },
    UP_PORT
  );
  assert.equal(res.status, 0);
  const j = JSON.parse((res.stdout || "").trim());
  assert.equal(j.decision, "deny");
});

test("quoted skycastle secrets in grep does not deny", () => {
  const res = run(
    { toolInput: { command: 'grep -n "skycastle secrets" docs.md' } },
    UP_PORT
  );
  assert.equal(res.status, 0);
  assert.equal((res.stdout || "").trim(), "");
});

test("ops verb whoami allows", () => {
  const res = run({ toolInput: { command: "skycastle whoami" } }, UP_PORT);
  assert.equal(res.status, 0);
  assert.equal((res.stdout || "").trim(), "");
});
