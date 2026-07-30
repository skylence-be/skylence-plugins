// Repo-level guard for the class of failure that has now shipped three times:
// a PreToolUse matcher that compiles fine but can never match a live tool name,
// so the hook it guards is silently dead. No error, no log, green suite.
//
// Lineage: #37 (skyline-claude nudge pinned to mcp__.*__skyline_grep$),
// #39 (six skybox/skycastle matchers pinned to skyline_run), #41 (the enforce
// hook's ToolSearch hint pinned to one server prefix). Every occurrence was
// found by a human reading matcher strings, never by a test.
//
// Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const PLUGINS_DIR = path.resolve(__dirname, "..", "plugins");

// Wire spellings a hook can actually be handed. Claude Code has namespaced a
// plugin's MCP server BOTH ways across versions, so a matcher pinned to one
// prefix is a latent break; grok/codex clients pass the bare tool name.
const SERVER_PREFIXES = [
  "mcp__skyline__",
  "mcp__plugin_skyline-claude_skyline__",
  "mcp__skybox__",
  "mcp__plugin_skybox-claude_skybox__",
  "mcp__skycastle__",
  "mcp__plugin_skycastle-claude_skycastle__",
];

// Post-v1.1.0 skyline tool names a steering hook plausibly targets.
const TOOL_NAMES = [
  "read",
  "edit",
  "create",
  "grep",
  "sgrep",
  "tree",
  "find",
  "git",
  "git_commit",
  "run",
  "run_batch",
  "run_job",
  "definition",
  "references",
  "symbols",
  "symbol_card",
];

const LIVE_TOOL_NAMES = [];
for (const tool of TOOL_NAMES) {
  LIVE_TOOL_NAMES.push(tool);
  for (const prefix of SERVER_PREFIXES) {
    LIVE_TOOL_NAMES.push(prefix + tool);
  }
}

// Native (non-MCP) tool names hooks legitimately match on.
const NATIVE_TOOL_NAMES = [
  "Bash",
  "Read",
  "Edit",
  "Write",
  "Grep",
  "Glob",
  "run_terminal_command",
  "read_file",
  "search_replace",
  "replace_file_content",
  "write_to_file",
  "list_dir",
];

function hooksJsonFiles() {
  return fs
    .readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(PLUGINS_DIR, e.name, "hooks", "hooks.json"))
    .filter((p) => fs.existsSync(p));
}

// Only PreToolUse/PostToolUse matchers select on a TOOL NAME. A SessionStart
// matcher selects the start source ("compact", "resume"), so it is not part of
// this class and must not be asserted against tool names.
const TOOL_MATCHED_EVENTS = new Set(["PreToolUse", "PostToolUse"]);

function matchersOf(file) {
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  const out = [];
  for (const [event, entries] of Object.entries(doc.hooks || {})) {
    if (!TOOL_MATCHED_EVENTS.has(event)) continue;
    for (const entry of entries) {
      if (typeof entry.matcher === "string") {
        out.push({ event, matcher: entry.matcher });
      }
    }
  }
  return out;
}

test("no hooks.json matcher names a pre-v1.1.0 skyline_ tool", () => {
  for (const file of hooksJsonFiles()) {
    for (const { event, matcher } of matchersOf(file)) {
      for (const tool of TOOL_NAMES) {
        assert.ok(
          !matcher.includes("skyline_" + tool),
          `${path.relative(PLUGINS_DIR, file)} ${event} matcher "${matcher}" ` +
            `names the pre-v1.1.0 form skyline_${tool}; the live tool is "${tool}"`
        );
      }
    }
  }
});

test("every hooks.json matcher can match at least one real tool name", () => {
  const candidates = LIVE_TOOL_NAMES.concat(NATIVE_TOOL_NAMES);
  for (const file of hooksJsonFiles()) {
    for (const { event, matcher } of matchersOf(file)) {
      const re = new RegExp(matcher);
      assert.ok(
        candidates.some((name) => re.test(name)),
        `${path.relative(PLUGINS_DIR, file)} ${event} matcher "${matcher}" ` +
          `matches no known tool name — it compiles but can never fire`
      );
    }
  }
});

test("a matcher targeting skyline's run also covers the split batch/job tools", () => {
  // v1.1.0 split `run` into run + run_batch + run_job. A steering hook that
  // inspects argv_list must still see the batch tool, or batch calls sail past.
  for (const file of hooksJsonFiles()) {
    for (const { event, matcher } of matchersOf(file)) {
      const re = new RegExp(matcher);
      const matchesRun = LIVE_TOOL_NAMES.some(
        (name) => name.endsWith("run") && re.test(name)
      );
      if (!matchesRun) continue;
      const batch = LIVE_TOOL_NAMES.filter((name) => name.endsWith("run_batch"));
      assert.ok(
        batch.some((name) => re.test(name)),
        `${path.relative(PLUGINS_DIR, file)} ${event} matcher "${matcher}" ` +
          `matches run but not run_batch; batch calls would bypass this hook`
      );
    }
  }
});
