// Watches the skycastle MCP daemon (port 8210) and emits a line ONLY on a
// state change. Mirrors skybox-claude's daemon-watchdog. Invoked as
// `node daemon-watchdog.js`, no shell needed. Each stdout line is delivered
// to the agent as a notification. Starts silent (assumes up) to avoid a false
// "restored" on session start.
//
// Probe = a bare GET /mcp. Any HTTP response means the daemon is up;
// a connection error/timeout means it is down.
//
// Tolerance (same rationale as skybox-claude, binary-skybox #402/#400): under
// load the daemon can answer a bare GET slower than a 1s timeout, producing a
// FALSE down→up flap. The probe allows 3s, and DOWN requires 2 CONSECUTIVE
// failed probes; a single failed tick never flips state, and one success
// restores UP immediately.

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 8210;

// Singleton lock: at most one live watchdog per daemon, per machine. Claude Code
// spawns this monitor once per session; without a guard, every concurrent
// session (plus any monitor left orphaned when its session ends) runs its own
// poller, accumulating into a swarm all polling one local daemon. Duplicates
// exit immediately here, and a stale lock (dead owner) is taken over.
const LOCK = path.join(os.tmpdir(), `skylence-watchdog-${PORT}.lock`);
function releaseLock() {
  try {
    if (fs.readFileSync(LOCK, "utf8").trim() === String(process.pid)) fs.unlinkSync(LOCK);
  } catch {}
}
function acquireLockOrExit() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(LOCK, "wx");
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      process.on("exit", releaseLock);
      return;
    } catch (e) {
      if (e.code !== "EEXIST") return;
      let owner = 0;
      try { owner = parseInt(fs.readFileSync(LOCK, "utf8").trim(), 10) || 0; } catch {}
      if (owner && owner !== process.pid) {
        try { process.kill(owner, 0); process.exit(0); }
        catch { try { fs.unlinkSync(LOCK); } catch {} }
      } else {
        try { fs.unlinkSync(LOCK); } catch {}
      }
    }
  }
}
acquireLockOrExit();

// Exit when orphaned: spawning session gone, notification pipe broke, or signalled.
const parentPid = process.ppid;
process.stdout.on("error", () => process.exit(0));
for (const sig of ["SIGTERM", "SIGHUP", "SIGINT"]) process.on(sig, () => process.exit(0));

const DOWN =
  "skycastle secrets MCP unavailable (daemon down). Do not fall back to the native `skycastle` CLI for secret reads or exports, wait briefly and retry the skycastle MCP tool, the launchd agent (be.skylence.skycastle.mcp) usually restarts it. If it stays down: launchctl kickstart -k gui/$(id -u)/be.skylence.skycastle.mcp";
const UP = "skycastle secrets MCP available. Resume silently: do not narrate the recovery.";

let wasUp = true; // assume up initially to suppress a false "restored" on startup

// DOWN is emitted only after this many consecutive failed probes; any single
// success resets the counter and restores UP immediately.
const DOWN_THRESHOLD = 2;
let consecutiveFailures = 0;

function probe() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port: 8210, path: "/mcp", timeout: 3000 },
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
  if (process.ppid !== parentPid) process.exit(0); // spawning session gone
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
