/**
 * feature-loop-skill compliance gate (field case 2026-07-26: haiku session
 * silently skipped all three advisor checkpoints AND reported "Deviations:
 * None"; prose rules alone do not bind small models mid-flow).
 *
 * Two modes, selected by argv[2]:
 *  - "commit": PostToolUse on commit-shaped tool calls. When feature-loop-skill
 *    was actually INVOKED this session (a real Skill tool_use call — see
 *    skillInvoked below), inject a one-line reminder that the ADVISOR GATE
 *    fires now if the committed slice was the model slice or first
 *    user-facing surface. Reminder at the trigger moment, where a separate
 *    paragraph was proven to get dropped.
 *  - "stop": Stop hook. When feature-loop-skill was invoked AND at least one
 *    commit-shaped call happened, refuse to end the session until SOME
 *    assistant message this session (not necessarily the last one) carries
 *    the mandatory FINAL attestation: a literal CHECKPOINT line copied from
 *    the build, plus a deviations mention. Once attested, later Stops in the
 *    same session (e.g. a post-build debrief turn) pass silently instead of
 *    re-demanding the report (field case 2026-07-26: a haiku session's
 *    Stop-gate re-fired on a DEBRIEF turn after FINAL had already been given
 *    earlier that session — pure noise, burned tokens). Blocks at most
 *    MAX_BLOCKS times per session, then fails open so a wedged model cannot
 *    loop forever.
 *
 * Fail-open on any parse/fs error: exit 0, no output.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const MAX_BLOCKS = 2;

// FINAL must COPY a live CHECKPOINT line (1.5.22+ canon), not paraphrase or
// reconstruct one: prose that merely discusses "advisor checkpoints" (a
// plan, a dispatch brief, the skill's own contract text) must not satisfy
// the gate once the scan below covers the whole session instead of just the
// last message.
const CHECKPOINT_LINE =
  /checkpoint:\s*(post-model|post-first-surface|pre-final)\s*=\s*(done|skipped|n\/a)/i;

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

// Parse the JSONL transcript once; invoke fn(contentBlocks) for every
// assistant message. Shared by skillInvoked (looks for a Skill tool_use)
// and attestationPresent (looks for a CHECKPOINT line in text blocks).
function forEachAssistantMessage(text, fn) {
  const lines = text.trim().split("\n");
  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (_e) {
      continue; // skip unparseable line
    }
    const msg = entry.message;
    if (entry.type === "assistant" && msg && Array.isArray(msg.content)) {
      fn(msg.content);
    }
  }
}

// Real invocation only: a Skill tool_use call whose input names
// feature-loop-skill (bare or namespaced, e.g. "skyline-claude:feature-loop-skill").
// Deliberately NOT a substring match on the raw transcript text: the ambient
// available-skills listing names every INSTALLED skill, including
// feature-loop-skill, in EVERY session on a box with this plugin present —
// whether or not the skill was ever invoked. A substring test gates every
// committing session on the box, not just build sessions (worse false
// positive than the debrief case this fix targets).
function skillInvoked(text) {
  let found = false;
  forEachAssistantMessage(text, (content) => {
    if (found) return;
    for (const block of content) {
      if (block.type === "tool_use" && block.name === "Skill") {
        const arg = String((block.input && block.input.skill) || "");
        if (arg === "feature-loop-skill" || arg.endsWith(":feature-loop-skill")) {
          found = true;
          break;
        }
      }
    }
  });
  return found;
}

// Commit-shaped: skyline git_commit tools, or a run/Bash call whose input
// carries a git commit. Matched loosely on the transcript side too.
function isCommitCall(toolName, toolInput) {
  const name = String(toolName || "");
  if (/git_commit$/.test(name)) return true;
  const asText = JSON.stringify(toolInput || {});
  return /"git"\s*,\s*"commit"|git commit/.test(asText);
}

// FINAL attestation: a literal CHECKPOINT line (copied, not reconstructed)
// plus a deviations mention, on ANY assistant message this session — not
// just the last one. FINAL can land several turns before the Stop hook
// actually fires (a debrief turn, a follow-up question); requiring it to be
// the LAST message is what produced the field false positive.
function attestationPresent(text) {
  let found = false;
  forEachAssistantMessage(text, (content) => {
    if (found) return;
    const t = content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    if (CHECKPOINT_LINE.test(t) && t.toLowerCase().includes("deviation")) {
      found = true;
    }
  });
  return found;
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
    // (a) Only gate sessions that actually built something this session.
    if (!/git_commit|"git"\s*,\s*"commit"|git commit/.test(text)) process.exit(0);
    // (b) FINAL already given earlier this session: later Stops pass silently.
    if (attestationPresent(text)) process.exit(0);
    // (c) Genuine in-build stop, no attestation ever emitted: keep blocking.
    const n = bumpBlockCount(blockCountFile(input));
    if (n > MAX_BLOCKS) process.exit(0); // fail-open, never wedge a session
    process.stderr.write(
      "feature-loop-skill FINAL attestation missing. Before ending: produce the mandatory FINAL report — slices shipped + commit ids; test counts; advisor checkpoints: COPY the live CHECKPOINT lines emitted during build, one per [post-model / post-first-surface / pre-final] — do not restate or reconstruct them from memory; a checkpoint with no CHECKPOINT line emitted must be said so and declared a deviation; deviations from the skill, where \"None\" is permitted only if every rule was followed as written."
    );
    process.exit(2);
  }

  process.exit(0);
}

main();
