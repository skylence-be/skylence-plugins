/**
 * feature-loop-skill compliance gate (field case 2026-07-26: haiku session
 * silently skipped all three advisor checkpoints AND reported "Deviations:
 * None"; prose rules alone do not bind small models mid-flow).
 *
 * Two modes, selected by argv[2]:
 *  - "commit": PostToolUse on commit-shaped tool calls. When the transcript
 *    shows feature-loop-skill was invoked this session, inject a one-line
 *    reminder that the ADVISOR GATE fires now if the committed slice was the
 *    model slice or first user-facing surface. Reminder at the trigger
 *    moment, where a separate paragraph was proven to get dropped.
 *  - "stop": Stop hook. When feature-loop-skill was invoked AND at least one
 *    commit-shaped call happened, refuse to end the session until the last
 *    assistant message carries the mandatory FINAL attestation (advisor
 *    checkpoints stated per-checkpoint + deviations field). Blocks at most
 *    LOOP_GATE_MAX_BLOCKS times per session, then fails open so a wedged
 *    model cannot loop forever.
 *
 * Fail-open on any parse/fs error: exit 0, no output.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const SKILL_MARKERS = ["feature-loop-skill"];
const MAX_BLOCKS = 2;

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch (_e) {
    return "";
  }
}

function transcriptText(input) {
  try {
    const p = input.transcript_path;
    if (!p || !fs.existsSync(p)) return "";
    return fs.readFileSync(p, "utf8");
  } catch (_e) {
    return "";
  }
}

function skillInvoked(text) {
  return SKILL_MARKERS.some((m) => text.includes(m));
}

// Commit-shaped: skyline git_commit tools, or a run/Bash call whose input
// carries a git commit. Matched loosely on the transcript side too.
function isCommitCall(toolName, toolInput) {
  const name = String(toolName || "");
  if (/git_commit$/.test(name)) return true;
  const asText = JSON.stringify(toolInput || {});
  return /"git"\s*,\s*"commit"|git commit/.test(asText);
}

function lastAssistantText(text) {
  // Transcript is JSONL; walk lines backwards for the last assistant text block.
  const lines = text.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      const msg = entry.message;
      if (entry.type === "assistant" && msg && Array.isArray(msg.content)) {
        const t = msg.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        if (t.trim()) return t;
      }
    } catch (_e) {
      /* skip unparseable line */
    }
  }
  return "";
}

function attestationPresent(finalText) {
  const t = finalText.toLowerCase();
  return t.includes("advisor checkpoint") && t.includes("deviation");
}

function blockCountFile(input) {
  const sid = String(input.session_id || process.ppid);
  return path.join(os.tmpdir(), `skyline-loop-gate-${sid}`);
}

function bumpBlockCount(file) {
  let n = 0;
  try {
    n = parseInt(fs.readFileSync(file, "utf8"), 10) || 0;
  } catch (_e) {
    /* first block */
  }
  n += 1;
  try {
    fs.writeFileSync(file, String(n));
  } catch (_e) {
    /* fail-open on next read */
  }
  return n;
}

function main() {
  const mode = process.argv[2];
  let input;
  try {
    input = JSON.parse(readStdin() || "{}");
  } catch (_e) {
    process.exit(0);
  }
  // Cheap check first: commit mode exits before any transcript read when the
  // call is not commit-shaped (run/Bash fire constantly on busy sessions).
  if (mode === "commit" && !isCommitCall(input.tool_name, input.tool_input)) {
    process.exit(0);
  }
  const text = transcriptText(input);
  if (!text || !skillInvoked(text)) process.exit(0);

  if (mode === "commit") {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext:
            "feature-loop-skill ADVISOR GATE: slice just committed. If that was the model slice or the first user-facing surface, consult the advisor NOW, before the next slice. Every checkpoint must appear in FINAL as done or skipped+reason.",
        },
      }) + "\n"
    );
    process.exit(0);
  }

  if (mode === "stop") {
    // Only gate sessions that actually built something.
    if (!/git_commit|"git"\s*,\s*"commit"|git commit/.test(text)) process.exit(0);
    if (attestationPresent(lastAssistantText(text))) process.exit(0);
    const n = bumpBlockCount(blockCountFile(input));
    if (n > MAX_BLOCKS) process.exit(0); // fail-open, never wedge a session
    process.stderr.write(
      "feature-loop-skill FINAL attestation missing. Before ending: produce the mandatory FINAL report — slices shipped + commit ids; test counts; advisor checkpoints EACH stated as done or skipped+reason (post-model / post-first-surface / pre-final); deviations from the skill, where \"None\" is permitted only if every rule was followed as written. If a checkpoint was skipped, say so explicitly now."
    );
    process.exit(2);
  }

  process.exit(0);
}

main();
