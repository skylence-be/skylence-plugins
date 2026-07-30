// node:test for skyline-skylore-deposit.js (skylence-plugins #411 scope (d)).
// Run with: node --test plugins/skyline-claude/hooks/skyline-skylore-deposit.test.js
// Once-per-session Stop deposit trigger: the first Stop blocks with the deposit
// prompt, a repeat Stop (or stop_hook_active) allows, malformed stdin exits 0.
// Self-contained; cleans its marker files.

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOOK = path.resolve(__dirname, "skyline-skylore-deposit.js");

const SESSIONS = ["sess-deposit-once", "sess-deposit-active", "sess-deposit-bad"];

function markerPath(sess) {
  const key = String(sess).replace(/[^a-z0-9_-]/gi, "_");
  return path.join(os.tmpdir(), `skyline-skylore-deposit-${key}.marker`);
}

function cleanMarkers() {
  for (const s of SESSIONS) {
    try {
      fs.rmSync(markerPath(s), { force: true });
    } catch {}
  }
}

cleanMarkers();
after(cleanMarkers);

function run(input, sess) {
  return spawnSync(process.execPath, [HOOK], {
    encoding: "utf8",
    input: JSON.stringify(input),
    env: { ...process.env, CLAUDE_SESSION_ID: sess },
  });
}

test("fires exactly once per session: first Stop blocks, second allows", () => {
  const sess = "sess-deposit-once";
  const r1 = run({ stop_hook_active: false }, sess);
  const r2 = run({ stop_hook_active: false }, sess);

  assert.equal(r1.status, 0, "first fire exits 0 with JSON");
  const out = JSON.parse(r1.stdout.trim());
  assert.equal(out.decision, "block", "first Stop blocks");
  assert.match(out.reason, /lore_mark/, "deposit prompt present");
  assert.match(out.reason, /kind=fact\/decision/, "names the mark kinds");
  // The four load-bearing clauses of the 2026-07-30 rewrite. Each one exists
  // because the bank audit found the old prompt produced the opposite: only
  // deposits, never recall, never a supersede, and PR-scoped noise.
  assert.match(out.reason, /lore_recall it FIRST/, "sends the agent to recall before depositing");
  assert.match(out.reason, /lore_supersede/, "names supersede as the duplicate-avoiding move");
  assert.match(out.reason, /nothing durable/, "empty deposit is an explicit acceptable answer");
  assert.match(out.reason, /one PR, branch, or todo/, "excludes PR/branch/todo-scoped detail");

  assert.equal(r2.status, 0, "second fire exits 0");
  assert.equal(r2.stdout.trim(), "", "second Stop in the same session does not block");
});

test("stop_hook_active=true never blocks (loop guard)", () => {
  const res = run({ stop_hook_active: true }, "sess-deposit-active");
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), "", "no block while already continuing from a stop hook");
});

test("malformed stdin exits 0 silent", () => {
  const res = spawnSync(process.execPath, [HOOK], {
    encoding: "utf8",
    input: "{ not json",
    env: { ...process.env, CLAUDE_SESSION_ID: "sess-deposit-bad" },
  });
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), "");
});
