/**
 * Stop deposit-trigger (skylence-plugins #411 scope (d)).
 * Disconfirmed expectations and discovered quirks are the highest-value lore,
 * yet they have no natural deposit trigger, so disconfirmations systematically
 * go unmarked. Fire ONCE per session on Stop: block the stop a single time and
 * feed back a deposit prompt so the agent records learnings before finishing.
 * A session marker (O_EXCL, mirroring skyline-enforce's reminder collapse) makes
 * it exactly-once; stop_hook_active guards the continuation turn against a loop.
 * Fail-open on any error: exit 0, no block.
 *
 * PROMPT WORDING (revised 2026-07-30 after an audit of the 171-mark bank): the
 * original text asked only "did you learn anything?", and a prompt that only
 * asks for deposits only gets deposits — the bank came out ~25% redundant with
 * 1 of 171 marks ever superseded. The corrective rules (recall first, supersede
 * over re-mark, scope it, exclude PR-scoped detail) do NOT live here: a blocked
 * Stop reason is the worst place to put a procedure, since it lands as a wall
 * of text exactly when the agent wants to be finished, and it would have to be
 * kept in sync across the claude and grok twins. They live in
 * skills/skylore-deposit-skill/SKILL.md, which this prompt points at. What
 * stays inline is only what must survive the skill being unavailable: the
 * question itself, and the fact that "nothing durable" is a correct answer.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const DEPOSIT_PROMPT =
  "Stop check: anything this session that would cost the next one real time to re-derive? \"Nothing durable\" is a correct answer — say it and stop. If there IS something, invoke skylore-deposit-skill and follow it: it covers recall-before-mark, supersede-instead-of-duplicate, scoping, and what does not belong in the bank.";

function getSessionKey() {
  const id = process.env.CLAUDE_SESSION_ID;
  return id ? String(id) : String(process.ppid);
}

function getDepositMarkerPath() {
  const key = getSessionKey().replace(/[^a-z0-9_-]/gi, "_");
  return path.join(os.tmpdir(), `skyline-skylore-deposit-${key}.marker`);
}

/** true on first fire this session (O_EXCL), false on repeats / fs error. */
function isFirstDeposit() {
  try {
    fs.closeSync(fs.openSync(getDepositMarkerPath(), "wx"));
    return true;
  } catch (_err) {
    return false;
  }
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(buf || "{}");
    // Already continuing because a Stop hook blocked: never block again.
    if (input.stop_hook_active === true) process.exit(0);
  } catch (_e) {
    process.exit(0); // malformed => silent exit 0
  }

  // Exactly-once per session: the second Stop finds the marker and allows.
  if (!isFirstDeposit()) process.exit(0);

  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason: DEPOSIT_PROMPT,
    }) + "\n"
  );
  // Natural exit flushes async Windows pipe writes (see skyline-regate.js).
});
