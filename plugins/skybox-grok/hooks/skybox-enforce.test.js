// node:test for skybox-enforce.js (Grok port)
// Run: node --test plugins/skybox-grok/hooks/skybox-enforce.test.js

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync, spawn } = require("child_process");
const path = require("path");

const HOOK = path.resolve(__dirname, "skybox-enforce.js");
const UP_PORT = 17070 + (process.pid % 100);

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
    setTimeout(() => reject(new Error("dummy skybox server failed")), 3000);
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
      SKYBOX_DAEMON_HOST: "127.0.0.1",
      SKYBOX_DAEMON_PORT: String(port),
    },
  });
}

test("daemon down: skybox index allows (fail-open)", () => {
  const res = run({ toolInput: { command: "skybox index /tmp/r" } }, 19999);
  assert.equal(res.status, 0);
  assert.equal((res.stdout || "").trim(), "");
});

test("daemon up: skybox index denies with index_repo reason", () => {
  const res = run({ toolInput: { command: "skybox index /tmp/r" } }, UP_PORT);
  assert.equal(res.status, 0);
  const j = JSON.parse((res.stdout || "").trim());
  assert.equal(j.decision, "deny");
  assert.match(j.reason, /index_repo/);
});

test("daemon up: skyline run argv skybox query denies", () => {
  const res = run(
    { tool_input: { argv: ["skybox", "query", "User"] } },
    UP_PORT
  );
  assert.equal(res.status, 0);
  const j = JSON.parse((res.stdout || "").trim());
  assert.equal(j.decision, "deny");
  assert.match(j.reason, /query/);
});

test("quoted skybox pattern in grep does not deny", () => {
  const res = run(
    { toolInput: { command: 'grep -n "skybox index" README.md' } },
    UP_PORT
  );
  assert.equal(res.status, 0);
  assert.equal((res.stdout || "").trim(), "");
});

test("ops verb doctor allows", () => {
  const res = run({ toolInput: { command: "skybox doctor" } }, UP_PORT);
  assert.equal(res.status, 0);
  assert.equal((res.stdout || "").trim(), "");
});

test("malformed stdin allows", () => {
  const res = spawnSync(process.execPath, [HOOK], {
    encoding: "utf8",
    input: "not-json",
    env: {
      ...process.env,
      SKYBOX_DAEMON_PORT: String(UP_PORT),
    },
  });
  assert.equal(res.status, 0);
});
