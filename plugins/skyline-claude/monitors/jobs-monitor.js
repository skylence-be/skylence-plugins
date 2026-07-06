// Tails <skyline-data-dir>/jobs/events.ndjson and emits ONE notification line
// per NEW terminal job event (exited/lost). Invoked as `node jobs-monitor.js`,
// no shell needed. Each stdout line is delivered to Claude as a notification
// by the monitor harness (same channel as the now-removed daemon-watchdog.js —
// see skylence-be/skylence-plugins#9 for why that one was removed: its signal
// was redundant with the error a session already gets on the next tool call.
// This monitor is NOT redundant the same way — a background job's terminal
// state has no other channel back to the session — so it is built anyway,
// tracked in skylence-be/skyline#20).
//
// DATA DIR: mirrors skyline_data_dir() exactly (same resolution as
// friction-nudge.js used before its removal in #9) — SKYLINE_DATA_DIR env
// override first, else the platform cache dir (macOS:
// ~/Library/Caches/skyline, Windows: %LOCALAPPDATA%/skyline, else
// $XDG_CACHE_HOME or ~/.cache/skyline) — jobs live under
// "<that dir>/jobs/events.ndjson". SKYLENCE_JOBS_DIR overrides the jobs dir
// directly (test/dev convenience), on top of the skyline_data_dir default.
//
// SCHEMA (produced by the skyline daemon's job runner): one JSON object per
// line in events.ndjson:
//   {"ts":"<rfc3339>","job_id":N,"queue":"<name>","argv0":"...",
//    "state":"exited"|"lost","exit":N|null,"raw":"<path>"}
//
// OFFSET TRACKING: the last-read byte offset is persisted in
// <jobs-dir>/.monitor-offset so a restart never replays history. A partial
// last line (mid-append read) is never consumed: the offset only ever
// advances up to the last complete newline, and the trailing partial bytes
// are re-read (with their completion) on the next tick.
//
// SINGLETON + ORPHAN EXIT: same proven pattern as the pre-#9 daemon
// watchdogs (skylence-be/skylence-plugins#8) — a machine-wide lock file
// (O_EXCL create, stale-owner takeover via a liveness probe) ensures at most
// one live poller per machine; the poller exits promptly when orphaned (its
// spawning session dies, its notification pipe breaks, or it is signalled).
//
// Malformed JSON on a complete line is skipped (never crashes the monitor)
// and its bytes are still consumed, so one bad line does not wedge the tail
// forever.

const fs = require("fs");
const os = require("os");
const path = require("path");

function defaultDataDir() {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Caches", "skyline");
  }
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "skyline");
  }
  return path.join(process.env.XDG_CACHE_HOME || path.join(home, ".cache"), "skyline");
}

const SKYLINE_DATA_DIR = process.env.SKYLINE_DATA_DIR || defaultDataDir();
const JOBS_DIR = process.env.SKYLENCE_JOBS_DIR || path.join(SKYLINE_DATA_DIR, "jobs");
const EVENTS_FILE = path.join(JOBS_DIR, "events.ndjson");
const OFFSET_FILE = path.join(JOBS_DIR, ".monitor-offset");
const POLL_MS = parseInt(process.env.SKYLINE_JOBS_POLL_MS || "3000", 10) || 3000;

// --- singleton lock: at most one live jobs-monitor per machine --------------
const LOCK = path.join(os.tmpdir(), "skylence-jobs-monitor.lock");

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
      if (e.code !== "EEXIST") return; // lock FS unusable -> don't block tailing
      let owner = 0;
      try {
        owner = parseInt(fs.readFileSync(LOCK, "utf8").trim(), 10) || 0;
      } catch {}
      if (owner && owner !== process.pid) {
        try {
          process.kill(owner, 0); // throws if the owner is gone
          process.exit(0); // owner alive -> we are a duplicate, exit silently
        } catch {
          try {
            fs.unlinkSync(LOCK); // owner dead -> clear the stale lock and retry
          } catch {}
        }
      } else {
        try {
          fs.unlinkSync(LOCK); // our own stale lock -> clear and retry
        } catch {}
      }
    }
  }
}

if (require.main === module) acquireLockOrExit();

// --- exit when orphaned ------------------------------------------------------
const parentPid = process.ppid; // reparents (usually to 1) when the session dies
process.stdout.on("error", () => process.exit(0)); // notification pipe broke
for (const sig of ["SIGTERM", "SIGHUP", "SIGINT"]) {
  process.on(sig, () => process.exit(0));
}

function readOffset() {
  try {
    const v = parseInt(fs.readFileSync(OFFSET_FILE, "utf8").trim(), 10);
    return Number.isInteger(v) && v >= 0 ? v : 0;
  } catch {
    return 0;
  }
}

function writeOffset(n) {
  try {
    fs.mkdirSync(JOBS_DIR, { recursive: true });
    fs.writeFileSync(OFFSET_FILE, String(n));
  } catch {}
}

function formatTerminalState(event) {
  if (event.state === "exited") {
    return event.exit === null || event.exit === undefined ? "exited" : `exited ${event.exit}`;
  }
  return "LOST";
}

function isValidEvent(event) {
  return (
    event &&
    typeof event === "object" &&
    typeof event.job_id !== "undefined" &&
    typeof event.queue === "string" &&
    (event.state === "exited" || event.state === "lost") &&
    typeof event.raw === "string"
  );
}

// Reads new bytes since the persisted offset, emits one notification line per
// complete valid JSON line, and advances the offset only past complete lines
// — a trailing partial line (mid-append) is left for the next tick.
function tick() {
  let size;
  try {
    size = fs.statSync(EVENTS_FILE).size;
  } catch {
    return; // file does not exist yet; wait for the next tick
  }

  const offset = readOffset();
  if (size <= offset) {
    if (size < offset) writeOffset(0); // file was truncated/rotated; resync
    return;
  }

  let chunk;
  try {
    const fd = fs.openSync(EVENTS_FILE, "r");
    const buf = Buffer.alloc(size - offset);
    fs.readSync(fd, buf, 0, buf.length, offset);
    fs.closeSync(fd);
    chunk = buf.toString("utf8");
  } catch {
    return; // transient read error; retry next tick
  }

  const lastNewline = chunk.lastIndexOf("\n");
  if (lastNewline === -1) return; // no complete line yet

  const complete = chunk.slice(0, lastNewline);
  for (const line of complete.split("\n")) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue; // malformed line: skip, do not crash
    }
    if (!isValidEvent(event)) continue;
    if (event.state === "exited" && event.exit === 0) continue; // routine success: notify only failures, unknown exits, and lost jobs
    process.stdout.write(
      `skyline job ${event.job_id} (queue=${event.queue}) ${formatTerminalState(event)} — raw: ${event.raw}\n`
    );
  }

  writeOffset(offset + lastNewline + 1);
}

let watcher = null;
function watchDir() {
  if (watcher) return;
  try {
    watcher = fs.watch(JOBS_DIR, () => tick());
    watcher.on("error", () => {
      try {
        watcher.close();
      } catch {}
      watcher = null;
    });
  } catch {
    // directory does not exist yet, or fs.watch unsupported here; the
    // low-frequency poll loop below is the fallback.
  }
}

function loop() {
  if (process.ppid !== parentPid) process.exit(0); // spawning session gone
  tick();
  watchDir();
  setTimeout(loop, POLL_MS);
}

module.exports = { tick, formatTerminalState, isValidEvent, readOffset, writeOffset };

if (require.main === module) loop();
