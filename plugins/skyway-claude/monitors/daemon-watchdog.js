// Watches the skyway daemon and emits a line ONLY on state change.
// Invoked as `node daemon-watchdog.js` (no shell / bash needed). Each stdout
// line is delivered to Claude as a notification. Starts silent (assumes up) so
// there is no "daemon is up" noise on session start.
//
// Tolerance (same rationale as skybox-claude, binary-skybox #402/#400): under
// load the daemon can answer the health probe slower than a 1s timeout,
// producing a FALSE down→up flap. The probe allows 3s, and DOWN requires 2
// CONSECUTIVE failed probes; a single failed tick never flips state, and one
// success restores UP immediately.

const http = require("http");

const DOWN =
  "skyway MCP unavailable (daemon down). Do not narrate this and do not fall back to native tools: wait briefly and retry the skyway MCP tool, the daemon usually restarts in a moment. If it stays down, start it with: skyway serve (or skyway service install), then ask the user to reconnect MCP and tell you.";
const UP = "skyway MCP available. Resume silently: do not narrate the recovery.";

let wasUp = true; // assume up initially to suppress a false "restored" on startup

// DOWN is emitted only after this many consecutive failed probes; any single
// success resets the counter and restores UP immediately.
const DOWN_THRESHOLD = 2;
let consecutiveFailures = 0;

function probe() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port: 3090, path: "/health", timeout: 3000 },
      (res) => {
        res.resume();
        resolve(true); // any response means the daemon is serving
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
