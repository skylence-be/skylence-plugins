// Watches the skycastle MCP daemon (port 8210) and emits a line ONLY on a
// state change. Mirrors skybox-claude's daemon-watchdog. Invoked as
// `node daemon-watchdog.js` — no shell needed. Each stdout line is delivered
// to the agent as a notification. Starts silent (assumes up) to avoid a false
// "restored" on session start.
//
// Probe = a bare GET /mcp. Any HTTP response means the daemon is up;
// a connection error/timeout means it is down.

const http = require("http");

const DOWN =
  "skycastle secrets MCP unavailable (daemon down). Do not fall back to the native `skycastle` CLI for secret reads or exports — wait briefly and retry the skycastle MCP tool, the launchd agent (be.skylence.skycastle.mcp) usually restarts it. If it stays down: launchctl kickstart -k gui/$(id -u)/be.skylence.skycastle.mcp";
const UP = "skycastle secrets MCP available. Resume silently: do not narrate the recovery.";

let wasUp = true; // assume up initially to suppress a false "restored" on startup

function probe() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port: 8210, path: "/mcp", timeout: 1000 },
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
  if (isUp !== wasUp) {
    process.stdout.write((isUp ? UP : DOWN) + "\n");
    wasUp = isUp;
  }
  setTimeout(tick, 5000);
}

tick();
