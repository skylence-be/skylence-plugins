// PreToolUse enforcement: redirect native tools to skyline equivalents.
// Cross-platform (Windows/macOS/Linux) port of skyline-enforce.sh — invoked as
// `node skyline-enforce.js <mode>` so it needs no shell and no bash on PATH.
// Hardens per binary-skyline#549: (a) DAEMON-READY GUARD (probe http://127.0.0.1:7333
// ≤500ms; unreachable => one-line stderr notice + exit 0 passthrough, no block);
// (b) PER-SESSION THROTTLE (full guidance once via O_EXCL marker under os.tmpdir();
// key=CLAUDE_SESSION_ID||ppid; repeats emit one line); (c) SIZE THRESHOLD (bash cmd
// <~120 chars && no pipe/redirect => skip entirely). Normal deny (exit 2) unchanged.

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const MODE = process.argv[2] || "";

const DAEMON_HOST = process.env.SKYLINE_DAEMON_HOST || "127.0.0.1";
const DAEMON_PORT = Number(process.env.SKYLINE_DAEMON_PORT || 7333);
const DAEMON_TIMEOUT = 500;

// PHP marker: a composer.json in the cwd flags a PHP project, which adds the
// PHP-oriented skyline_symbol_card to the on-ramp menu plus a one-sentence note.
// Fail-open: any fs/cwd error just omits the augmentation (no throw, no block).
function hasComposer() {
  try {
    return fs.existsSync(path.join(process.cwd(), "composer.json"));
  } catch (_e) {
    return false;
  }
}

const COMPOSER = hasComposer();

// The CORE menu the switch instruction points agents at. The three semantic
// navigators (definition/references/symbols) are language-generic and always
// listed (skylence-plugins#15 on-ramp, design pad 226 §2 L2). skyline_symbol_card
// is PHP-oriented, so it joins the menu only in a PHP project.
const CORE =
  "select:mcp__plugin_skyline-claude_skyline__skyline_read," +
  "mcp__plugin_skyline-claude_skyline__skyline_edit," +
  "mcp__plugin_skyline-claude_skyline__skyline_create," +
  "mcp__plugin_skyline-claude_skyline__skyline_grep," +
  "mcp__plugin_skyline-claude_skyline__skyline_tree," +
  "mcp__plugin_skyline-claude_skyline__skyline_find," +
  "mcp__plugin_skyline-claude_skyline__skyline_git," +
  "mcp__plugin_skyline-claude_skyline__skyline_run," +
  "mcp__plugin_skyline-claude_skyline__skyline_definition," +
  "mcp__plugin_skyline-claude_skyline__skyline_references," +
  "mcp__plugin_skyline-claude_skyline__skyline_symbols" +
  (COMPOSER
    ? ",mcp__plugin_skyline-claude_skyline__skyline_symbol_card"
    : "");

// Appended to the switch guidance in a PHP project. This consolidates the
// interim PHP steering PR#12 added to the grep message: symbol_card is named
// once here (and listed in CORE) for every redirected native tool, not only grep.
const PHP_NOTE = COMPOSER
  ? " PHP project: skyline_symbol_card answers symbol questions (declaration + callers + resolution) in one call."
  : "";

const SWITCH_ORIENT = `Skyline is active. Switch to skyline tools for this session: run ToolSearch("${CORE}") then retry.${PHP_NOTE}`;
const SWITCH_EDIT = `Skyline is active. Switch to skyline tools for this session: run ToolSearch("${CORE}") then skyline_guide, then retry.${PHP_NOTE}`;

const MESSAGES = {
  read: `skyline_read replaces Read. ${SWITCH_ORIENT}`,
  edit: `skyline_edit/skyline_create replace Edit/Write. ${SWITCH_EDIT}`,
  grep: `skyline_grep/skyline_sgrep replace Grep. ${SWITCH_ORIENT}`,
  glob: `skyline_find/skyline_tree replace Glob. ${SWITCH_ORIENT}`,
  bash: `skyline_grep/skyline_find/skyline_git/skyline_run/skyline_test replace Bash. ${SWITCH_EDIT}`,
};

function getSessionKey() {
  const id = process.env.CLAUDE_SESSION_ID;
  return id ? String(id) : String(process.ppid);
}

function getMarkerPath() {
  const key = getSessionKey().replace(/[^a-z0-9_-]/gi, "_");
  return path.join(os.tmpdir(), `skyline-enforce-session-${key}.marker`);
}

function isSubThreshold(command) {
  if (typeof command !== "string") return false;
  const s = command.trim();
  if (s.length >= 120) return false;
  if (/[|><]/.test(s)) return false;
  return true;
}

function readToolInput() {
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    const finish = () => {
      try {
        resolve(JSON.parse(buf || "{}"));
      } catch {
        resolve({});
      }
    };
    process.stdin.on("data", (d) => (buf += d));
    process.stdin.on("end", finish);
    if (process.stdin.readableEnded) finish();
  });
}

async function main() {
  const msg = MESSAGES[MODE];
  if (!msg) {
    process.exit(0);
  }

  const input = await readToolInput();
  const ti = input.tool_input || input.toolInput || input || {};
  const command = MODE === "bash" ? String(ti.command || "") : "";

  if (MODE === "bash" && isSubThreshold(command)) {
    // size threshold: skip the nudge entirely for trivial commands
    process.exit(0);
  }

  // DAEMON-READY GUARD: probe before any blocking decision
  const isUp = await new Promise((resolve) => {
    const req = http.get(
      { host: DAEMON_HOST, port: DAEMON_PORT, path: "/mcp", timeout: DAEMON_TIMEOUT },
      (res) => {
        res.resume();
        resolve(true);
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });

  if (!isUp) {
    process.stderr.write(
      `skyline daemon unreachable (${DAEMON_HOST}:${DAEMON_PORT} ≤${DAEMON_TIMEOUT}ms); allowing native tool\n`
    );
    process.exit(0);
  }

  // PER-SESSION THROTTLE: O_EXCL marker ensures cross-process "at most once"
  const marker = getMarkerPath();
  let showFull = false;
  try {
    fs.closeSync(fs.openSync(marker, "wx"));
    showFull = true;
  } catch (err) {
    showFull = false; // EEXIST or other -> one-liner
  }

  if (showFull) {
    process.stderr.write(msg + "\n");
  } else {
    process.stderr.write("Skyline redirect (full guidance shown once per session)\n");
  }
  process.exit(2);
}

main().catch(() => {
  // never let an error in hook wedge the agent
  process.exit(0);
});
