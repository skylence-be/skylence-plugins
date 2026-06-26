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

const http = require("http");

const DOWN =
  "skybox code-graph MCP unavailable (daemon down). Its query/context/impact/route_map tools have no native equivalent — do NOT fall back to guessing code structure from grep; wait briefly and retry the skybox tool, the launchd agent (be.skylence.skybox.mcp) usually restarts it. If it stays down, run: launchctl kickstart -k gui/$(id -u)/be.skylence.skybox.mcp (or: skybox mcp serve --transport http --bind 127.0.0.1 --port 7070), then reconnect MCP.";
const UP = "skybox code-graph MCP available. Resume silently: do not narrate the recovery.";

let wasUp = true; // assume up initially to suppress a false "restored" on startup

function probe() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port: 7070, path: "/mcp", timeout: 1000 },
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
