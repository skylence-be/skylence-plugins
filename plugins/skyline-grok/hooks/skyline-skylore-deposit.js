/**
 * Stop deposit-trigger (skylence-plugins #411 scope (d)).
 * Disconfirmed expectations and discovered quirks are the highest-value lore,
 * yet they have no natural deposit trigger, so disconfirmations systematically
 * go unmarked. Fire ONCE per session on Stop: block the stop a single time and
 * feed back a deposit prompt so the agent records learnings before finishing.
 * A session marker (O_EXCL, mirroring skyline-enforce's reminder collapse) makes
 * it exactly-once; stop_hook_active guards the continuation turn against a loop.
 * Fail-open on any error: exit 0, no block.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const DEPOSIT_PROMPT =
  "Before finishing: any disconfirmed expectations or discovered quirks this session? Deposit them with skyline_lore_mark (kind=fact/decision, why= naming what you expected instead). Manifest contents don't count.";

function getSessionKey() {
  const id = process.env.GROK_SESSION_ID || process.env.CLAUDE_SESSION_ID;
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
    if (input.stop_hook_active === true || input.stopHookActive === true) process.exit(0);
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
