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

// skyrift: land-with-promote orientation vs. a fan-out hint. Walk up for the
// .skyrift-workspace marker (mirrors hasGitAncestor's ancestor walk).
function inSkyriftWorkspace(dir) {
  if (!dir) return false;
  try {
    let d = path.resolve(dir);
    for (let i = 0; i < 64; i++) {
      if (fs.existsSync(path.join(d, ".skyrift-workspace"))) return true;
      const parent = path.dirname(d);
      if (parent === d) break;
      d = parent;
    }
  } catch (_e) {
    /* fail-open */
  }
  return false;
}

function skyriftAvailable() {
  try {
    const r = spawnSync("skyrift", ["--version"], {
      encoding: "utf8",
      timeout: 500,
    });
    return r.status === 0;
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

// skyrift (a): inside a .skyrift-workspace, work is on a disposable detached
// clone; land it with promote, never push, and it is reapable. The one fact
// that silently misdirects or loses work when missed.
const SKYRIFT_WORKSPACE_FACT =
  "You are in a skyrift copy-on-write workspace: a disposable clone of its source on a detached HEAD. Land committed work with `skyrift promote <path> [--push <remote>]`, not by pushing from here. The workspace is reapable (`skyrift gc`/`discard` may remove it), so keep nothing here you cannot regenerate or promote; a `.skyrift-hold` marker pins it against reaping.";

// skyrift (b): in a git source that is NOT a workspace, when skyrift exists,
// prefer a CoW workspace to a full clone for isolated parallel work.
const SKYRIFT_FANOUT_HINT =
  "For isolated parallel work, `skyrift create` a copy-on-write workspace (clonefile/reflink, near-free) instead of a full clone or sharing the checkout; `skyrift gc` only previews unless given `--apply --force`.";

// Lane H: blueprint invocation enforcement. A manifest names a stack; if its
// <stack>-blueprint-skill is actually installed, the primer tells the agent
// to invoke it before the first edit. feature-loop-skill 1.5.24's own ORIENT
// prose names the same detection as a follow-on sentence after its numbered
// pipeline; that instruction-to-invoke is an unforced hop (field evidence:
// haiku invoked feature-loop-skill, then never invoked any blueprint skill).
// This SURFACE makes the hop unforced no longer, at SessionStart, before
// ORIENT ever runs.
const STACK_BLUEPRINT_CHAINS = {
  filament: [
    "filament-blueprint-skill",
    "livewire-blueprint-skill",
    "laravel-blueprint-skill",
  ],
  livewire: ["livewire-blueprint-skill", "laravel-blueprint-skill"],
  laravel: ["laravel-blueprint-skill"],
  rust: ["rust-blueprint-skill"],
  go: ["go-blueprint-skill"],
};

// Mirrors feature-loop-skill 1.5.24 ORIENT semantics exactly: composer.json
// substring "filament" implies the whole laravel+livewire+filament chain
// (livewire/livewire is often only a transitive dependency of
// filament/filament and may never appear as a direct require); "livewire"
// implies laravel; "laravel" alone is terminal. Cargo.toml/go.mod map to
// their own single-skill chain.
function detectStackChain(cwd) {
  if (!cwd) return null;
  try {
    const composerPath = path.join(cwd, "composer.json");
    if (fs.existsSync(composerPath)) {
      const content = fs.readFileSync(composerPath, "utf8");
      if (content.includes("filament")) return STACK_BLUEPRINT_CHAINS.filament;
      if (content.includes("livewire")) return STACK_BLUEPRINT_CHAINS.livewire;
      if (content.includes("laravel")) return STACK_BLUEPRINT_CHAINS.laravel;
      return null;
    }
    if (hasMarker(cwd, "Cargo.toml")) return STACK_BLUEPRINT_CHAINS.rust;
    if (hasMarker(cwd, "go.mod")) return STACK_BLUEPRINT_CHAINS.go;
  } catch (_e) {
    /* fail-open: no chain */
  }
  return null;
}

// ~/.claude by default; overridable so tests never depend on this machine's
// real installed plugins (mirrors hasLoreBank's SKYLORE_DB override above).
function claudeConfigDir() {
  const explicit = process.env.CLAUDE_CONFIG_DIR;
  if (explicit) return explicit;
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return null;
  return path.join(home, ".claude");
}

// installed_plugins.json's installPath entries are the actually-installed
// copies; the marketplaces/ source tree (browsable, not necessarily
// installed) and a stale cache/ version are not enough to call a skill
// installed. Missing/malformed file => no paths, fail-open to "not
// installed" rather than throwing.
function installedPluginPaths() {
  const root = claudeConfigDir();
  if (!root) return [];
  try {
    const raw = fs.readFileSync(
      path.join(root, "plugins", "installed_plugins.json"),
      "utf8"
    );
    const data = JSON.parse(raw);
    const plugins = (data && data.plugins) || {};
    const paths = [];
    for (const key of Object.keys(plugins)) {
      for (const install of plugins[key] || []) {
        if (install && install.installPath) paths.push(install.installPath);
      }
    }
    return paths;
  } catch (_e) {
    return [];
  }
}

function blueprintSkillInstalled(skillName, pluginPaths) {
  for (const installPath of pluginPaths) {
    try {
      if (fs.existsSync(path.join(installPath, "skills", skillName))) {
        return true;
      }
    } catch (_e) {
      /* skip this install path */
    }
  }
  return false;
}

// One imperative line naming every INSTALLED skill in the detected chain;
// empty when the chain is null or none of it is installed (zero noise,
// never tell the agent to invoke a skill that is not there).
function blueprintInvocationContext(cwd) {
  const chain = detectStackChain(cwd);
  if (!chain) return "";
  const pluginPaths = installedPluginPaths();
  const installed = chain.filter((name) =>
    blueprintSkillInstalled(name, pluginPaths)
  );
  if (installed.length === 0) return "";
  const names = installed.map((name) => "`" + name + "`").join(", ");
  return (
    "Implementing or fixing in this repo: invoke " +
    names +
    " (Skill tool) at plan time, before the first edit."
  );
}
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

  const blueprintLine = blueprintInvocationContext(cwd);
  if (blueprintLine) {
    context = context ? context + "\n\n" + blueprintLine : blueprintLine;
  }

  if (hasLoreBank()) {
    context = context ? context + "\n\n" + LORE_CONTEXT : LORE_CONTEXT;
  }

  // #411 + scope (e): ONE orientation message. Environment facts front-loaded,
  // then the (unchanged) language + skylore steer assembled above. ABS_PATH_FACT
  // and FOCUS_LICENSE are unconditional, so there is always output on a valid
  // payload (malformed stdin still exits 0 silently above).
  // Haiku bench 2026-07-26 (skylore 61/62): small models cannot construct the
  // absolute path from the abstract rule alone and read a wrong-base zero-match
  // as proof of absence. When the harness supplies cwd, name the CONCRETE root
  // and the zero-match check in the same front-loaded part (appended, so the
  // test's startsWith(ABS_PREFIX) contract holds).
  const absFact = cwd
    ? ABS_PATH_FACT +
      " This session's project root is " +
      cwd +
      " - prefix relative paths with it, or pass cwd:" +
      JSON.stringify(cwd) +
      ' on the call. On "No matches found." check the "(searched ...)" line first: if it is not this root, fix the path - never conclude a file is absent from a wrong-base search.'
    : ABS_PATH_FACT;
  const parts = [absFact, FOCUS_LICENSE];
  const projectDir = process.env.CLAUDE_PROJECT_DIR || cwd;
  // #415 F1: assert git-lessness only for a KNOWN location with no .git up
  // the whole ancestor chain; an unknown location says nothing rather than
  // fabricating an environment fact.
  const gitless = Boolean(projectDir) && !hasGitAncestor(projectDir);
  if (gitless) {
    parts.push(GITLESS_FACT);
  }
  // skyrift: inside a workspace, the land-with-promote orientation; otherwise,
  // in a git source where skyrift is installed, a fan-out hint. Exclusive.
  if (inSkyriftWorkspace(projectDir)) {
    parts.push(SKYRIFT_WORKSPACE_FACT);
  } else if (!gitless && projectDir && skyriftAvailable()) {
    parts.push(SKYRIFT_FANOUT_HINT);
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
