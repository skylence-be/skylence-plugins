// Self-contained node test for jobs-monitor.js (no test framework in this repo
// yet). Run with: node plugins/skyline-claude/monitors/jobs-monitor.test.js
// Exercises offset tracking (no replay across a simulated restart) and
// partial/malformed-line tolerance against a temp events file. Exit code 0 on
// pass, 1 on first failure.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "jobs-monitor-test-"));
process.env.SKYLENCE_JOBS_DIR = TMP;

const monitor = require("./jobs-monitor.js");

const EVENTS_FILE = path.join(TMP, "events.ndjson");
const OFFSET_FILE = path.join(TMP, ".monitor-offset");

// --- 0. default path resolution mirrors skyline_data_dir() ----------------
// (SKYLINE_DATA_DIR override, jobs live under "<that dir>/jobs/events.ndjson")
// Exercised in a fresh child process since JOBS_DIR is computed once at
// require time in the module under test.
const dataDirTmp = fs.mkdtempSync(path.join(os.tmpdir(), "jobs-monitor-datadir-test-"));
fs.mkdirSync(path.join(dataDirTmp, "jobs"), { recursive: true });
fs.writeFileSync(
  path.join(dataDirTmp, "jobs", "events.ndjson"),
  JSON.stringify({ ts: "2026-07-04T00:00:00Z", job_id: 99, queue: "datadir", argv0: "cmd", state: "lost", exit: null, raw: "/tmp/99.raw" }) + "\n"
);
const childOut = execFileSync(
  process.execPath,
  ["-e", "require('./jobs-monitor.js').tick();"],
  {
    cwd: __dirname,
    env: { ...process.env, SKYLINE_DATA_DIR: dataDirTmp, SKYLENCE_JOBS_DIR: "" },
    encoding: "utf8",
  }
);
assert(
  childOut === "skyline job 99 (queue=datadir) LOST — raw: /tmp/99.raw\n",
  `default resolution reads <SKYLINE_DATA_DIR>/jobs/events.ndjson (got ${JSON.stringify(childOut)})`
);
fs.rmSync(dataDirTmp, { recursive: true, force: true });

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

function withCapturedStdout(fn) {
  const lines = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => {
    lines.push(s);
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = orig;
  }
  return lines;
}

function append(text) {
  fs.appendFileSync(EVENTS_FILE, text);
}

// --- 1. file absent: tick() must not throw --------------------------------
withCapturedStdout(() => monitor.tick());
assert(true, "tick() on a missing events file does not throw");

// --- 2. exit-0 is suppressed; unknown-exit and lost still notify ----------
const exited = { ts: "2026-07-04T00:00:00Z", job_id: 1, queue: "default", argv0: "cmd", state: "exited", exit: 0, raw: "/tmp/1.raw" };
const lost = { ts: "2026-07-04T00:00:01Z", job_id: 2, queue: "default", argv0: "cmd", state: "lost", exit: null, raw: "/tmp/2.raw" };
const exitedUnknown = { ts: "2026-07-04T00:00:02Z", job_id: 5, queue: "default", argv0: "cmd", state: "exited", exit: null, raw: "/tmp/5.raw" };
append(JSON.stringify(exited) + "\n");
append(JSON.stringify(lost) + "\n");
append(JSON.stringify(exitedUnknown) + "\n");

let out = withCapturedStdout(() => monitor.tick());
assert(out.length === 2, `exit-0 termination is suppressed; lost and unknown-exit emit (got ${out.length})`);
assert(out[0] === "skyline job 2 (queue=default) LOST \u2014 raw: /tmp/2.raw\n", `lost line formatted correctly (got ${JSON.stringify(out[0])})`);
assert(out[1] === "skyline job 5 (queue=default) exited \u2014 raw: /tmp/5.raw\n", `unknown-exit line formatted correctly (got ${JSON.stringify(out[1])})`);

const offsetAfterFirstTick = monitor.readOffset();
assert(offsetAfterFirstTick === fs.statSync(EVENTS_FILE).size, "offset advances to end of file after complete lines");

// --- 3. simulated restart: re-reading offset from disk never replays ------
out = withCapturedStdout(() => monitor.tick());
assert(out.length === 0, "a second tick with no new data emits nothing (no replay)");
assert(monitor.readOffset() === offsetAfterFirstTick, "offset is stable across a no-op tick");

// --- 4. partial last line (mid-append) is tolerated, not consumed ---------
const partial = { ts: "2026-07-04T00:00:02Z", job_id: 3, queue: "q2", argv0: "cmd", state: "exited", exit: 1, raw: "/tmp/3.raw" };
const partialJson = JSON.stringify(partial);
append(partialJson.slice(0, 10)); // no trailing newline: simulates a mid-append read

out = withCapturedStdout(() => monitor.tick());
assert(out.length === 0, "a partial trailing line emits nothing");
assert(monitor.readOffset() === offsetAfterFirstTick, "offset does not advance past a partial trailing line");

append(partialJson.slice(10) + "\n"); // complete the line
out = withCapturedStdout(() => monitor.tick());
assert(out.length === 1, "completing the partial line on the next tick emits exactly one notification");
assert(out[0] === "skyline job 3 (queue=q2) exited 1 — raw: /tmp/3.raw\n", `completed partial line formatted correctly (got ${JSON.stringify(out[0])})`);

const offsetAfterPartial = monitor.readOffset();

// --- 5. malformed complete line is skipped but its bytes are consumed -----
append("{not valid json\n");
const valid4 = { ts: "2026-07-04T00:00:03Z", job_id: 4, queue: "q3", argv0: "cmd", state: "lost", exit: null, raw: "/tmp/4.raw" };
append(JSON.stringify(valid4) + "\n");

out = withCapturedStdout(() => monitor.tick());
assert(out.length === 1, `malformed line is skipped, only the valid line emits (got ${out.length})`);
assert(out[0] === "skyline job 4 (queue=q3) LOST — raw: /tmp/4.raw\n", "line after a malformed one is still processed");
assert(monitor.readOffset() > offsetAfterPartial, "offset advances past the malformed line too (never wedges the tail)");

// --- 6. offset file exists and is a plain byte count ----------------------
assert(fs.existsSync(OFFSET_FILE), ".monitor-offset file is persisted to disk");
assert(/^\d+$/.test(fs.readFileSync(OFFSET_FILE, "utf8").trim()), ".monitor-offset contains a plain byte offset");

fs.rmSync(TMP, { recursive: true, force: true });

if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("all assertions passed");
