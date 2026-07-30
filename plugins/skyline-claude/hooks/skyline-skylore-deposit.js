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
 * asks for deposits only gets deposits. The bank came out ~25% redundant (14
 * marks for one env-inheritance fact, 9 for one composer quirk) with 1 of 171
 * marks ever superseded, because nothing pushed back toward recall-first or
 * toward correcting an existing mark. So the prompt now (a) makes "nothing
 * durable" an explicit acceptable answer, (b) sends the agent to lore_recall
 * before depositing, (c) names lore_supersede as the move when a mark already
 * covers the ground, and (d) rules out PR/branch/todo-scoped detail, which is
 * the other thing the audit found clogging the bank.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const DEPOSIT_PROMPT =
  "Stop check: did anything this session contradict what you expected, or would it cost the next session real time to re-derive? If not, say \"nothing durable\" and stop — an empty deposit is a fine answer. If yes, lore_recall it FIRST: when a mark already covers the ground, lore_supersede that one rather than depositing a near-duplicate. Otherwise lore_mark one or two, kind=fact/decision, why= the expectation it broke or the alternative it beat, repo= unless the fact is genuinely machine-wide. Skip what a file, manifest, or parser already states, and skip anything scoped to one PR, branch, or todo — that belongs in the PR or the todo.";

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
