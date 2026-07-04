// Watches the skyline daemon and emits a line ONLY on state change.
// Cross-platform (Windows/macOS/Linux) port of daemon-watchdog.sh, invoked as
// `node daemon-watchdog.js` so it needs no shell and no bash on PATH.
// Each stdout line is delivered to Claude as a notification by the monitor
// harness. Starts silent (no "daemon is up" noise on session start).
//
// Tolerance (same rationale as skybox-claude, binary-skybox #402/#400): under
// load the daemon can answer a bare GET slower than a 1s timeout, producing a
// FALSE down→up flap. The probe allows 3s, and DOWN requires 2 CONSECUTIVE
// failed probes; a single failed tick never flips state, and one success
// restores UP immediately.
//
// SINGLETON + ORPHAN EXIT: Claude Code spawns this monitor once per session.
// Without a guard, every concurrent session (plus every monitor left orphaned
// when its session ends) runs its own 5s poller, accumulating into a swarm of
// node processes all polling one local daemon (observed: 5+ leaked instances).
// So: (1) a machine-wide lock keyed by port lets only ONE watchdog poll; any
// duplicate exits immediately, and a stale lock (dead owner) is taken over;
// (2) the poller exits promptly when orphaned (its spawning parent dies, its
// notification pipe breaks, or it receives a termination signal).

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 7333;

// --- singleton lock: at most one live watchdog per daemon, per machine -------
const LOCK = path.join(os.tmpdir(), `skylence-watchdog-${PORT}.lock`);

function releaseLock() {
  try {
    if (fs.readFileSync(LOCK, "utf8").trim() === String(process.pid)) {
      fs.unlinkSync(LOCK);
    }
  } catch {}
}

function acquireLockOrExit() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(LOCK, "wx"); // O_EXCL: fails if the lock exists
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      process.on("exit", releaseLock);
      return; // we own the lock
    } catch (e) {
      if (e.code !== "EEXIST") return; // lock FS unusable → don't block probing
      let owner = 0;
      try {
        owner = parseInt(fs.readFileSync(LOCK, "utf8").trim(), 10) || 0;
      } catch {}
      if (owner && owner !== process.pid) {
        try {
          process.kill(owner, 0); // throws if the owner is gone
          process.exit(0); // owner alive → we are a duplicate, exit silently
        } catch {
          try {
            fs.unlinkSync(LOCK); // owner dead → clear the stale lock and retry
          } catch {}
        }
      } else {
        try {
          fs.unlinkSync(LOCK); // our own stale lock → clear and retry
        } catch {}
      }
    }
  }
}

acquireLockOrExit();

// --- exit when orphaned ------------------------------------------------------
const parentPid = process.ppid; // reparents (usually to 1) when the session dies
process.stdout.on("error", () => process.exit(0)); // notification pipe broke
for (const sig of ["SIGTERM", "SIGHUP", "SIGINT"]) {
  process.on(sig, () => process.exit(0));
}

const DOWN =
  "skyline MCP unavailable (daemon down). Do not narrate this and do not fall back to native tools: wait briefly and retry the skyline tool, the daemon usually restarts in a moment. If it stays down, run: skyline daemon install --port 7333, then ask the user to reconnect MCP and tell you.";
const UP = "skyline MCP available. Resume silently: do not narrate the recovery.";

let wasUp = true; // assume up initially to suppress a false "restored" on startup

// DOWN is emitted only after this many consecutive failed probes; any single
// success resets the counter and restores UP immediately.
const DOWN_THRESHOLD = 2;
let consecutiveFailures = 0;

function probe() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port: PORT, path: "/mcp", timeout: 3000 },
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
