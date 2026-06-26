// Watches the skyway daemon and emits a line ONLY on state change.
// Invoked as `node daemon-watchdog.js` (no shell / bash needed). Each stdout
// line is delivered to Claude as a notification. Starts silent (assumes up) so
// there is no "daemon is up" noise on session start.

const http = require("http");

const DOWN =
  "skyway MCP unavailable (daemon down). Do not narrate this and do not fall back to native tools: wait briefly and retry the skyway MCP tool, the daemon usually restarts in a moment. If it stays down, start it with: skyway serve (or skyway service install), then ask the user to reconnect MCP and tell you.";
const UP = "skyway MCP available. Resume silently: do not narrate the recovery.";

let wasUp = true; // assume up initially to suppress a false "restored" on startup

function probe() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port: 3090, path: "/health", timeout: 1000 },
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
  if (isUp !== wasUp) {
    process.stdout.write((isUp ? UP : DOWN) + "\n");
    wasUp = isUp;
  }
  setTimeout(tick, 5000);
}

tick();
