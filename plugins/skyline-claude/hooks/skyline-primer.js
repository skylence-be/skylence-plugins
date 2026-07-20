/**
 * SessionStart primer (skylence-plugins#20 R3).
 * Arms the agent with the right first-tool guidance for symbol questions at session start.
 * Reads stdin JSON; looks for top-level "cwd".
 * Emits ONLY additionalContext on SessionStart hook (no permission decision).
 * Fail-open on any error/parse/fs: exit 0, no output.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function hasMarker(cwd, name) {
  if (!cwd) return false;
  try {
    return fs.existsSync(path.join(cwd, name));
  } catch (_e) {
    return false;
  }
}

// #415 F1: a single existsSync at the top dir fabricates "no git" for
// repo-SUBDIR sessions. Mirror skyline-enforce.js projectRoot(): walk up for
// .git (dir OR worktree file), then a rev-parse fallback for exotic layouts.
function hasGitAncestor(dir) {
  if (!dir) return false;
  try {
    let d = path.resolve(dir);
    for (let i = 0; i < 64; i++) {
      if (fs.existsSync(path.join(d, ".git"))) return true;
      const parent = path.dirname(d);
      if (parent === d) break;
      d = parent;
    }
  } catch (_e) {
    /* fall through to rev-parse */
  }
  try {
    const r = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: path.resolve(dir),
      encoding: "utf8",
      timeout: 500,
    });
    return r.status === 0 && String(r.stdout).trim() === "true";
  } catch (_e) {
    return false;
  }
}

// The skylore bank is operator-wide, not per-project, so this fires regardless
// of language markers. Only advertised when the bank actually exists: a first
// recall that returns nothing teaches the agent within one call that recall is
// useless, right before the bank would have become useful.
function hasLoreBank() {
  try {
    const explicit = process.env.SKYLORE_DB;
    if (explicit) return fs.existsSync(explicit);
    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home) return false;
    return fs.existsSync(path.join(home, ".skylence", "skylore.db"));
  } catch (_e) {
    return false;
  }
}

const LORE_CONTEXT =
  "Skyline hosts the skylore memory bank. Call skyline_lore_recall BEFORE re-deriving any \"why is it done this way / did we already decide X / what broke last time\" question: it is ranked (BM25), deterministic, costs no LLM call, and every hit cites its provenance. Keep durable decisions and gotchas with skyline_lore_mark. Route by tier: skyline_lore_* for cross-project decisions, preferences and gotchas that live in no file; skyline_memory_* for per-project markdown notes; skybox/LSP for code structure, which you should never memorize because a parser re-derives it.";

// #411: front-load the one environment fact that silently breaks every skyline
// call when missed. The daemon's cwd is /, so a relative path (a bare ".") is
// resolved against / and rejected. Always emitted.
const ABS_PATH_FACT =
  "The skyline daemon runs with cwd /; pass absolute paths to every skyline tool (never a bare \".\"). A relative path resolves against / and the tool rejects or misresolves it.";

// #411 scope (e): license the agent to ignore harness task-tracker nags on
// linear jobs. Always emitted (must appear in every rendered sample).
const FOCUS_LICENSE =
  "Harness task-tracker reminders are noise on linear single-feature jobs " +
  String.fromCharCode(0x2014) +
  " ignore them unless multi-step tracking genuinely helps you.";

// #411: a git-less workspace silently loses pint --dirty, acuity semantic
// freshness verification, and commit checkpoints. Emitted only when no .git.
const GITLESS_FACT =
  "No git in this workspace: pint --dirty is a no-op, acuity semantic freshness will read unverified (vendor leg: binary-skyline#719), and there are no commit checkpoints.";

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  let cwd = "";
  try {
    const input = JSON.parse(buf || "{}");
    cwd = input.cwd == null ? "" : String(input.cwd);
  } catch (_e) {
    process.exit(0); // malformed => silent exit 0
  }

  let context = "";
  if (hasMarker(cwd, "composer.json")) {
    context = "Skyline semantic PHP tools are active here. For symbol questions (where is X defined, who calls Y, which same-named class resolves), don't conclude from text counts: run skyline_symbol_card(path, line, symbol) or skyline_references and reconcile. A name_only hit is unconfirmed until you verify its receiver, and if symbol_card's count disagrees with a grep count, decompose by receiver. Read symbol_card's provenance and freshness before assuming the index is degraded; use skyline_grep for literal text only.";
  } else if (hasMarker(cwd, "Cargo.toml") || hasMarker(cwd, "go.mod")) {
    context = "Skyline semantic tools active. For symbol questions, don't conclude from grep counts: run skyline_definition, skyline_references, or skyline_implementation and reconcile any unproven hit by checking its receiver; read the tool's freshness before assuming degradation.";
  }

  if (hasLoreBank()) {
    context = context ? context + "\n\n" + LORE_CONTEXT : LORE_CONTEXT;
  }

  // #411 + scope (e): ONE orientation message. Environment facts front-loaded,
  // then the (unchanged) language + skylore steer assembled above. ABS_PATH_FACT
  // and FOCUS_LICENSE are unconditional, so there is always output on a valid
  // payload (malformed stdin still exits 0 silently above).
  const parts = [ABS_PATH_FACT, FOCUS_LICENSE];
  const projectDir = process.env.CLAUDE_PROJECT_DIR || cwd;
  // #415 F1: assert git-lessness only for a KNOWN location with no .git up
  // the whole ancestor chain; an unknown location says nothing rather than
  // fabricating an environment fact.
  if (projectDir && !hasGitAncestor(projectDir)) {
    parts.push(GITLESS_FACT);
  }
  if (context) {
    parts.push(context);
  }
  context = parts.join("\n\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: context,
      },
    }) + "\n"
  );
  // Natural exit flushes async Windows pipe writes (see skyline-regate.js).
});
