// node:test for skyline-loop-gate.js (field case 2026-07-26: Stop-gate
// re-demanded a FULL attestation on a post-build DEBRIEF turn after FINAL had
// already been given that session).
// Run with: node --test plugins/skyline-claude/hooks/skyline-loop-gate.test.js
//
// Covers:
//   (a) no real feature-loop-skill invocation this session -> Stop passes
//       silently, INCLUDING the deeper bug found while fixing this: the
//       ambient available-skills listing names feature-loop-skill in every
//       session, so a bare substring test false-positives on ANY committing
//       session, not just build sessions.
//   (b) FINAL attestation given earlier this session -> a later Stop (e.g. a
//       debrief turn with no attestation in its own text) passes silently,
//       with a paired fixture that blocks when the earlier attestation is
//       absent.
//   (c) genuine in-build Stop with no attestation ever emitted keeps
//       blocking, with the 1.5.22+ "COPY the live CHECKPOINT lines" demand
//       text, and the MAX_BLOCKS fail-open still holds.
//   Detector precision: prose that only discusses "advisor checkpoints" and
//   "deviations" (no literal CHECKPOINT: line) does not satisfy the gate;
//   invoking a DIFFERENT skill (debug-loop-skill) does not count as
//   feature-loop-skill invocation even alongside the ambient listing.
//
// Self-contained; each test writes its own transcript file under a fresh
// temp dir and uses a unique session_id (os.tmpdir() ignores TMPDIR on
// Windows, so isolation is via session_id, not env).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOOK = path.resolve(__dirname, "skyline-loop-gate.js");

let seq = 0;
function uniqueSessionId(tag) {
  seq += 1;
  return `lg-test-${tag}-${process.pid}-${Date.now()}-${seq}`;
}

function freshTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "loop-gate-test-"));
}

function line(entry) {
  return JSON.stringify(entry);
}

// Ambient system-reminder every session carries: lists every installed
// skill by name, including feature-loop-skill, whether or not it was ever
// invoked. This is the false-positive source found while fixing the bug.
function skillListingLine() {
  return line({
    type: "attachment",
    attachment: {
      type: "skill_listing",
      content:
        "- skyline-claude:feature-loop-skill: FIRST ACTION of implementation work...\n- skyline-claude:debug-loop-skill: FIRST ACTION of fix work...",
      skillCount: 2,
      isInitial: true,
      names: ["skyline-claude:feature-loop-skill", "skyline-claude:debug-loop-skill"],
    },
  });
}

function assistantText(text) {
  return line({
    type: "assistant",
    message: { content: [{ type: "text", text }] },
  });
}

// Real invocation shape (verified against session
// a5bae5ae-914a-411d-acad-60ead2234e28.jsonl:18-20): a Skill tool_use call
// is ALWAYS followed by a "Launching skill: <arg>" tool_result (type
// "user"), then the skill's full body auto-injected as a "Base directory
// for this skill: ..." message (also type "user", isMeta:true). bodyText
// defaults to a snippet mirroring feature-loop-skill/SKILL.md's real
// "...git_commit green slice" line -- the exact literal substring that
// used to false-positive the old whole-transcript commit check
// (Finding 1, review bounce todo 69 c245).
function assistantSkillInvoke(skillArg, bodyText) {
  const toolUseId = `toolu_${skillArg.replace(/[^a-z0-9]/gi, "")}`;
  const injectedBody =
    bodyText !== undefined
      ? bodyText
      : "SLICE CYCLE (repeat per slice):\n  generate/locate -> edit(anchors) -> diagnostics(batch) -> test -> format+commit\n  checkpoint: formatter via run -> git_commit green slice (rollback points)\n";
  return [
    line({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", id: toolUseId, name: "Skill", input: { skill: skillArg } },
        ],
      },
    }),
    line({
      type: "user",
      message: {
        content: [
          { type: "tool_result", tool_use_id: toolUseId, content: `Launching skill: ${skillArg}` },
        ],
      },
    }),
    line({
      type: "user",
      isMeta: true,
      message: {
        content: [
          { type: "text", text: `Base directory for this skill: /skills/${skillArg}\n\n${injectedBody}` },
        ],
      },
    }),
  ].join("\n");
}

function assistantGitCommit() {
  return line({
    type: "assistant",
    message: {
      content: [
        {
          type: "tool_use",
          name: "mcp__skyline__git_commit",
          input: { subcommand: "commit", args: ["-m", "wip"] },
        },
      ],
    },
  });
}

function writeTranscript(dir, entries) {
  const p = path.join(dir, "transcript.jsonl");
  fs.writeFileSync(p, entries.join("\n") + "\n");
  return p;
}

function runStop(transcriptPath, sessionId) {
  const res = spawnSync(process.execPath, [HOOK, "stop"], {
    encoding: "utf8",
    input: JSON.stringify({ transcript_path: transcriptPath, session_id: sessionId }),
  });
  return { code: res.status, err: res.stderr || "", out: res.stdout || "" };
}

function runCommit(transcriptPath, sessionId, toolName, toolInput) {
  const res = spawnSync(process.execPath, [HOOK, "commit"], {
    encoding: "utf8",
    input: JSON.stringify({
      transcript_path: transcriptPath,
      session_id: sessionId,
      tool_name: toolName,
      tool_input: toolInput,
    }),
  });
  return { code: res.status, out: res.stdout || "" };
}

const FINAL_ATTESTATION_TEXT =
  "FINAL report:\nslices shipped: 1 (abc123)\ntest counts: 4 passed\nadvisor checkpoints:\nCHECKPOINT: post-model = done\nCHECKPOINT: pre-final = done\ndeviations: None";

// --- (a) no real build activity -> Stop passes silently --------------------

test("(a) no skill invocation, no commit: Stop passes silently", () => {
  const tmp = freshTmp();
  const t = writeTranscript(tmp, [skillListingLine(), assistantText("just chatting")]);
  const { code, err } = runStop(t, uniqueSessionId("a1"));
  assert.equal(code, 0);
  assert.equal(err, "");
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("(a) ambient skill listing + a commit but feature-loop-skill NEVER invoked: Stop passes silently (the deeper bug)", () => {
  const tmp = freshTmp();
  // The listing alone used to satisfy the old substring-based skillInvoked(),
  // false-positiving on any committing session. No Skill tool_use here.
  const t = writeTranscript(tmp, [
    skillListingLine(),
    assistantGitCommit(),
    assistantText("done, committed"),
  ]);
  const { code, err } = runStop(t, uniqueSessionId("a2"));
  assert.equal(code, 0, "must not gate a session that never invoked feature-loop-skill");
  assert.equal(err, "");
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("(a) feature-loop-skill invoked but no commit-shaped call: Stop passes silently", () => {
  const tmp = freshTmp();
  const t = writeTranscript(tmp, [
    assistantSkillInvoke("feature-loop-skill"),
    assistantText("orienting, nothing committed yet"),
  ]);
  const { code, err } = runStop(t, uniqueSessionId("a3"));
  assert.equal(code, 0);
  assert.equal(err, "");
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("invoking a DIFFERENT skill (debug-loop-skill) does not count as feature-loop-skill invocation", () => {
  const tmp = freshTmp();
  const t = writeTranscript(tmp, [
    skillListingLine(),
    assistantSkillInvoke("debug-loop-skill"),
    assistantGitCommit(),
    assistantText("fixed it"),
  ]);
  const { code, err } = runStop(t, uniqueSessionId("other-skill"));
  assert.equal(code, 0);
  assert.equal(err, "");
  fs.rmSync(tmp, { recursive: true, force: true });
});

// --- (b) FINAL given earlier this session -> later Stops pass silently -----

test("(b) FINAL attestation emitted earlier, later debrief turn has no attestation: Stop passes silently", () => {
  const tmp = freshTmp();
  const t = writeTranscript(tmp, [
    assistantSkillInvoke("feature-loop-skill"),
    assistantGitCommit(),
    assistantText(FINAL_ATTESTATION_TEXT),
    // Post-build debrief turn: no CHECKPOINT/deviation text at all.
    assistantText("Sure, here is a plain-English recap of what shipped."),
  ]);
  const { code, err } = runStop(t, uniqueSessionId("b-pass"));
  assert.equal(code, 0, "attestation given earlier must satisfy a later Stop");
  assert.equal(err, "");
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("(b) paired fixture: same shape but the earlier FINAL attestation is absent: Stop still blocks", () => {
  const tmp = freshTmp();
  const t = writeTranscript(tmp, [
    assistantSkillInvoke("feature-loop-skill"),
    assistantGitCommit(),
    assistantText("Shipped the slice, moving on."),
    assistantText("Sure, here is a plain-English recap of what shipped."),
  ]);
  const { code, err } = runStop(t, uniqueSessionId("b-block"));
  assert.equal(code, 2, "no attestation anywhere this session must still block");
  assert.match(err, /FINAL attestation missing/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

// --- (c) genuine in-build stop keeps blocking, with 1.5.22+ demand text ----

test("(c) in-build stop with no attestation: blocks with the COPY-the-CHECKPOINT-lines demand", () => {
  const tmp = freshTmp();
  const t = writeTranscript(tmp, [
    assistantSkillInvoke("feature-loop-skill"),
    assistantGitCommit(),
    assistantText("still working on the next slice"),
  ]);
  const { code, err } = runStop(t, uniqueSessionId("c-demand"));
  assert.equal(code, 2);
  assert.match(err, /COPY the live CHECKPOINT lines/);
  assert.doesNotMatch(err, /EACH stated as done or skipped\+reason/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("(c) MAX_BLOCKS fail-open: blocks twice, then passes on the third Stop of the same session", () => {
  const tmp = freshTmp();
  const t = writeTranscript(tmp, [
    assistantSkillInvoke("feature-loop-skill"),
    assistantGitCommit(),
    assistantText("still working"),
  ]);
  const sid = uniqueSessionId("c-maxblocks");
  const r1 = runStop(t, sid);
  const r2 = runStop(t, sid);
  const r3 = runStop(t, sid);
  assert.equal(r1.code, 2, "block 1");
  assert.equal(r2.code, 2, "block 2");
  assert.equal(r3.code, 0, "fail-open on the 3rd Stop so a wedged model cannot loop forever");
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(path.join(os.tmpdir(), `skyline-loop-gate-${sid}`), { force: true });
});

// --- detector precision: prose mention is not a CHECKPOINT line ------------

test("mentioning 'advisor checkpoints' and 'deviations' in prose (no literal CHECKPOINT line) does not satisfy the gate", () => {
  const tmp = freshTmp();
  const t = writeTranscript(tmp, [
    assistantSkillInvoke("feature-loop-skill"),
    assistantGitCommit(),
    assistantText(
      "Plan: I will hit the advisor checkpoints at the usual points and report deviations at the end."
    ),
  ]);
  const { code, err } = runStop(t, uniqueSessionId("prose-mention"));
  assert.equal(code, 2, "a plan that only discusses checkpoints/deviations must not disarm the gate");
  assert.match(err, /FINAL attestation missing/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

// --- Finding 1 & Finding 2 regressions (review bounce todo 69 c245) --------

test("Finding 1 repro: skill's own auto-injected body contains literal 'git_commit' text, zero real commit tool_use: Stop passes silently", () => {
  const tmp = freshTmp();
  const t = writeTranscript(tmp, [
    assistantSkillInvoke("feature-loop-skill"),
    assistantText("Orienting now, nothing built or committed yet this session."),
  ]);
  const { code, err } = runStop(t, uniqueSessionId("finding1-repro"));
  assert.equal(
    code,
    0,
    "the skill's own auto-injected instructional text must never satisfy the commit-activity check"
  );
  assert.equal(err, "");
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("Finding 2 repro: message quotes an illustrative CHECKPOINT line while explaining the format, no real slices/test-count data: Stop still blocks", () => {
  const tmp = freshTmp();
  const t = writeTranscript(tmp, [
    assistantSkillInvoke("feature-loop-skill"),
    assistantGitCommit(),
    assistantText(
      "Sure, happy to recap what the format looks like. A CHECKPOINT line during a real build would read:\nCHECKPOINT: post-model = done\nCHECKPOINT: pre-final = done\nI didn't actually run either checkpoint this turn, and there are no deviations to report from this explanation itself."
    ),
  ]);
  const { code, err } = runStop(t, uniqueSessionId("finding2-repro"));
  assert.equal(
    code,
    2,
    "a message that only quotes an illustrative CHECKPOINT line, with no slices-shipped/test-count data, must not satisfy attestation"
  );
  assert.match(err, /FINAL attestation missing/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("positive fixture: FINAL in the skill's prescribed tree shape (SKILL.md FINAL:48-54) satisfies attestation: Stop passes silently", () => {
  const tmp = freshTmp();
  const finalTreeText =
    "FINAL:\n" +
    "├─ SIZE tier: MEDIUM, standard build\n" +
    "├─ slices shipped + commit ids: 1 slice, commit a1b2c3d\n" +
    "├─ test counts (passed/assertions): 16 passed, 0 failed\n" +
    "├─ advisor checkpoints:\n" +
    "CHECKPOINT: post-model = done\n" +
    "CHECKPOINT: pre-final = done\n" +
    "└─ deviations from this skill: None";
  const t = writeTranscript(tmp, [
    assistantSkillInvoke("feature-loop-skill"),
    assistantGitCommit(),
    assistantText(finalTreeText),
  ]);
  const { code, err } = runStop(t, uniqueSessionId("final-tree-shape"));
  assert.equal(code, 0, "a FINAL in the skill's own prescribed field shape must satisfy attestation");
  assert.equal(err, "");
  fs.rmSync(tmp, { recursive: true, force: true });
});

// --- commit mode: shares the same invocation detector -----------------------

test("commit mode: reminder fires when feature-loop-skill was really invoked", () => {
  const tmp = freshTmp();
  const t = writeTranscript(tmp, [assistantSkillInvoke("feature-loop-skill")]);
  const { code, out } = runCommit(t, uniqueSessionId("commit-fires"), "mcp__skyline__git_commit", {
    subcommand: "commit",
  });
  assert.equal(code, 0);
  const parsed = JSON.parse(out);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(parsed.hookSpecificOutput.additionalContext, /ADVISOR GATE/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("commit mode: stays silent when feature-loop-skill was never invoked (ambient listing only)", () => {
  const tmp = freshTmp();
  const t = writeTranscript(tmp, [skillListingLine(), assistantText("hello")]);
  const { code, out } = runCommit(t, uniqueSessionId("commit-silent"), "mcp__skyline__git_commit", {
    subcommand: "commit",
  });
  assert.equal(code, 0);
  assert.equal(out, "");
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("commit mode: non-commit-shaped tool call exits before any transcript read", () => {
  const tmp = freshTmp();
  const t = writeTranscript(tmp, [assistantSkillInvoke("feature-loop-skill")]);
  const { code, out } = runCommit(t, uniqueSessionId("commit-noncommit"), "mcp__skyline__run", {
    argv: ["ls"],
  });
  assert.equal(code, 0);
  assert.equal(out, "");
  fs.rmSync(tmp, { recursive: true, force: true });
});

// --- fail-open --------------------------------------------------------------

test("missing transcript_path fails open (exit 0, no output)", () => {
  const res = spawnSync(process.execPath, [HOOK, "stop"], {
    encoding: "utf8",
    input: JSON.stringify({ session_id: uniqueSessionId("no-transcript") }),
  });
  assert.equal(res.status, 0);
  assert.equal(res.stderr, "");
});

test("malformed stdin fails open (exit 0, no output)", () => {
  const res = spawnSync(process.execPath, [HOOK, "stop"], {
    encoding: "utf8",
    input: "{not json",
  });
  assert.equal(res.status, 0);
  assert.equal(res.stderr, "");
});
