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

// Every session id used below MUST be listed here: cleanMarkers() runs at load
// and in after(), and a marker left behind makes the NEXT suite's first fire
// (e.g. the grok twin, which shares $TMPDIR and the marker naming) a silent
// no-block, which surfaces as a JSON.parse of "".
const SESSIONS = [
  "sess-deposit-once",
  "sess-deposit-active",
  "sess-deposit-bad",
  "sess-deposit-skill-ref",
];

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
  // The prompt is a POINTER now: the procedure lives in the skill. Assert the
  // two things that must survive inline (the question, and that an empty
  // deposit is allowed) plus the handoff itself. A prompt that names the skill
  // but no longer offers the exit ramp would push every session into a deposit.
  assert.match(out.reason, /re-derive/, "asks the durability question inline");
  assert.match(out.reason, /"Nothing durable" is a correct answer/, "empty deposit stays an explicit answer");
  assert.match(out.reason, /invoke skylore-deposit-skill/, "hands off to the skill");
  assert.ok(
    out.reason.length < 400,
    `prompt must stay a pointer, not a procedure (was ${out.reason.length} chars)`
  );

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

// The prompt hands off to a skill by NAME. A pointer to a skill that does not
// exist, or whose frontmatter name has drifted, dies silently: the agent is
// told to invoke something unloadable and is left with no procedure at all.
// Same failure class as a hooks.json matcher that can never match.
test("the skill the prompt names exists and its frontmatter name matches", () => {
  const res = run({ stop_hook_active: false }, "sess-deposit-skill-ref");
  const named = JSON.parse(res.stdout.trim()).reason.match(
    /invoke ([a-z0-9-]+-skill)/
  );
  assert.ok(named, "prompt names a skill to invoke");

  const skillFile = path.resolve(
    __dirname,
    "..",
    "skills",
    named[1],
    "SKILL.md"
  );
  assert.ok(fs.existsSync(skillFile), `${named[1]} ships at skills/${named[1]}/SKILL.md`);

  const frontmatter = fs.readFileSync(skillFile, "utf8").split("---")[1] || "";
  assert.match(
    frontmatter,
    new RegExp(`name:\\s*${named[1]}\\b`),
    "SKILL.md frontmatter name matches the name the prompt invokes"
  );
});
