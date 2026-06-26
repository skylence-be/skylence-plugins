// Watches the skybox code-graph MCP daemon (port 7070) and emits a line ONLY on
// a state change. Mirrors skyline-claude's daemon-watchdog. Invoked as
// `node daemon-watchdog.js` — no shell needed. Each stdout line is delivered to
// the agent as a notification. Starts silent (assumes up) to avoid a false
// "restored" on session start.
//
// Probe = a bare GET /mcp. Verified harmless for skybox's rmcp streamable-http
// transport: it returns HTTP 406 and creates NO MCP session, so it does not add
// to the transport's session-teardown log noise. Any HTTP response (incl. 406)
// means the daemon is up; a connection error/timeout means it is down.
//
// Tolerance (binary-skybox #402/#400): the launchd daemon never actually
// restarts (runs=1, never exited); under load it just answers the bare GET
// slower than the old 1s timeout, producing a FALSE down→up flap. So the probe
// now allows 3s, and DOWN requires 2 CONSECUTIVE failed probes; a single failed
// tick never flips state, and one success restores UP immediately.

const http = require("http");

const DOWN =
  "skybox code-graph MCP unavailable (daemon down). Its query/context/impact/route_map tools have no native equivalent — do NOT fall back to guessing code structure from grep; wait briefly and retry the skybox tool, the launchd agent (be.skylence.skybox.mcp) usually restarts it. If it stays down, run: launchctl kickstart -k gui/$(id -u)/be.skylence.skybox.mcp (or: skybox mcp serve --transport http --bind 127.0.0.1 --port 7070), then reconnect MCP.";
const UP = "skybox code-graph MCP available. Resume silently: do not narrate the recovery.";

let wasUp = true; // assume up initially to suppress a false "restored" on startup

// DOWN is emitted only after this many consecutive failed probes; any single
// success resets the counter and restores UP immediately.
const DOWN_THRESHOLD = 2;
let consecutiveFailures = 0;

function probe() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port: 7070, path: "/mcp", timeout: 3000 },
      (res) => {
        res.resume(); // drain and discard; any response means the daemon is up
        resolve(true);
      }
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
  });
}

async function tick() {
  const isUp = await probe();
  if (isUp) {
    consecutiveFailures = 0;
    if (!wasUp) {
      process.stdout.write(UP + "\n");
      wasUp = true;
    }
  } else {
    consecutiveFailures += 1;
    if (wasUp && consecutiveFailures >= DOWN_THRESHOLD) {
      process.stdout.write(DOWN + "\n");
      wasUp = false;
    }
  }
  setTimeout(tick, 5000);
}

tick();
