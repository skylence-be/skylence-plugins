// PreToolUse enforcement: redirect native tools to skyline equivalents.
// Cross-platform (Windows/macOS/Linux) port of skyline-enforce.sh — invoked as
// `node skyline-enforce.js <mode>` so it needs no shell and no bash on PATH.
//
// Hardening lineage:
//   binary-skyline#549 — daemon-ready guard, bash size threshold
//   binary-skyline#706 / field #9 — EVERY denial carries the exact substitute
//     invocation (tool + mapped args), idempotently; no "shown once per session"
//     one-liner. ToolSearch select string is unconditional. File ops outside the
//     indexed repo tree (e.g. Write under ~/.claude) pass through. Field #11
//     plugin-side: long orient / symbol-hunt reminder collapses to one short
//     line after first occurrence per session; the substitute line never drops.
//
// Modes: read | edit | grep | glob | bash (unknown => exit 0)

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

// Factored detectors for symbol-hunt steering on native grep/bash (skylence-plugins#20).
// Only used to decide whether + what to append; never changes deny/allow/daemon logic.
const {
  isSymbolHunt,
  targetsNonCode,
  routeLang,
} = require("./steering-detect");

const MODE = process.argv[2] || "";

const DAEMON_HOST = process.env.SKYLINE_DAEMON_HOST || "127.0.0.1";
const DAEMON_PORT = Number(process.env.SKYLINE_DAEMON_PORT || 7333);
const DAEMON_TIMEOUT = 500;

// PHP marker: a composer.json in the cwd flags a PHP project, which adds the
// PHP-oriented symbol_card to the on-ramp menu plus a one-sentence note.
// Fail-open: any fs/cwd error just omits the augmentation (no throw, no block).
function hasComposer(cwd) {
  try {
    const base = cwd || process.cwd();
    return fs.existsSync(path.join(base, "composer.json"));
  } catch (_e) {
    return false;
  }
}

// The wire prefix a plugin's MCP server gets is NOT stable: Claude Code has
// namespaced this server as both `mcp__plugin_skyline-claude_skyline__*` and
// `mcp__skyline__*` on different versions (skylence-plugins#39 recorded the
// flip). `select:` is EXACT-name matching, so a hardcoded prefix that misses
// resolves zero tools and the refusal hands the agent a dead recovery path
// (field case 2026-07-30, skylence-plugins#41: the hint returned "No matching
// deferred tools found" on a plugin-namespaced box). Emit every name under
// both spellings — ToolSearch ignores names it cannot resolve, so the superset
// costs nothing and survives the next flip of the prefix.
const WIRE_PREFIXES = ["mcp__skyline__", "mcp__plugin_skyline-claude_skyline__"];

// The CORE menu the switch instruction points agents at. The three semantic
// navigators (definition/references/symbols) are language-generic and always
// listed (skylence-plugins#15 on-ramp). symbol_card is PHP-oriented.
const CORE_TOOLS = [
  "read",
  "edit",
  "create",
  "grep",
  "tree",
  "find",
  "git",
  "run",
  "definition",
  "references",
  "symbols",
];

function buildCore(composer) {
  const tools = CORE_TOOLS.slice();
  if (composer && !acuityMcpRoutePinnedOff()) {
    tools.push("symbol_card");
  }
  // Interleaved per tool, not grouped per prefix: if a client caps how many
  // results it returns, the agent still gets a spread of the menu rather than
  // every spelling of `read`.
  const names = [];
  for (const tool of tools) {
    for (const prefix of WIRE_PREFIXES) {
      names.push(prefix + tool);
    }
  }
  return "select:" + names.join(",");
}

// The symbol_card tip only holds when PHP is served by the acuity MCP route:
// the daemon's symbol_card_php_only_guard REFUSES on the LSP route, so a box
// pinned off it (SKYLINE_ACUITY_MCP_PHP explicitly falsy) must not be steered
// into a tool that errors on every call (binary-skyline#828 field case
// 2026-07-26). Runtime self-heal fallbacks are invisible to a hook; the env
// pin is the knowable half, and the daemon-side refusal message steers to
// definition/references for the rest.
function acuityMcpRoutePinnedOff() {
  const v = String(process.env.SKYLINE_ACUITY_MCP_PHP || "").toLowerCase();
  return v === "0" || v === "false" || v === "no" || v === "off";
}

function toolSearchLine(composer) {
  const php =
    composer && !acuityMcpRoutePinnedOff()
      ? " PHP project: symbol_card answers symbol questions (declaration + callers + resolution) in one call."
      : "";
  return `Tools deferred? run ToolSearch("${buildCore(composer)}") then retry.${php}`;
}

// --- session markers (field #11 plugin-side reminder collapse) -------------
function getSessionKey() {
  const id = process.env.CLAUDE_SESSION_ID;
  return id ? String(id) : String(process.ppid);
}

function getReminderMarkerPath() {
  const key = getSessionKey().replace(/[^a-z0-9_-]/gi, "_");
  return path.join(os.tmpdir(), `skyline-enforce-reminder-${key}.marker`);
}

/** true on first fire this session (O_EXCL), false on repeats / fs error. */
function isFirstReminder() {
  try {
    fs.closeSync(fs.openSync(getReminderMarkerPath(), "wx"));
    return true;
  } catch (_err) {
    return false;
  }
}

// --- project tree scoping (field #9 out-of-tree pass-through) --------------
function projectRoot(input) {
  const envRoot = process.env.CLAUDE_PROJECT_DIR || process.env.SKYLINE_PROJECT_ROOT;
  const cwd = input && input.cwd ? String(input.cwd) : process.cwd();
  let start = path.resolve(envRoot || cwd || process.cwd());
  // Walk up for .git so a nested cwd still scopes to the repo tree.
  try {
    let d = start;
    for (let i = 0; i < 64; i++) {
      if (fs.existsSync(path.join(d, ".git"))) return d;
      const parent = path.dirname(d);
      if (parent === d) break;
      d = parent;
    }
  } catch (_e) {
    /* fail-open to start */
  }
  // Optional: `git rev-parse` when .git walk missed (worktrees, etc.)
  try {
    const r = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: start,
      encoding: "utf8",
      timeout: 500,
    });
    if (r.status === 0 && r.stdout) {
      const top = r.stdout.trim();
      if (top) return path.resolve(top);
    }
  } catch (_e) {
    /* ignore */
  }
  return start;
}

function resolveAbs(filePath, root) {
  if (filePath == null || filePath === "") return null;
  const s = String(filePath);
  if (path.isAbsolute(s)) return path.resolve(s);
  return path.resolve(root || process.cwd(), s);
}

// Canonicalize before compare: symlinks, /tmp vs /private/tmp divergence, and
// case variants otherwise defeat the prefix check. A not-yet-created target
// canonicalizes via its parent dir; fail-open to the resolved spelling on any
// fs error.
function canonical(p) {
  try {
    return fs.realpathSync(p);
  } catch (_e) {
    try {
      return path.join(fs.realpathSync(path.dirname(p)), path.basename(p));
    } catch (_e2) {
      return p;
    }
  }
}

function isInsideTree(absPath, root) {
  if (!absPath || !root) return true; // unknown path => enforce (fail closed for in-repo tools)
  const a = canonical(path.resolve(absPath));
  const r = canonical(path.resolve(root));
  if (process.platform === "win32") {
    const al = a.toLowerCase();
    const rl = r.toLowerCase();
    return al === rl || al.startsWith(rl + path.sep);
  }
  return a === r || a.startsWith(r + path.sep);
}

// --- substitute formatting -------------------------------------------------
function fmtArgs(args) {
  if (!args || typeof args !== "object") return "";
  return Object.keys(args)
    .map((k) => {
      const v = args[k];
      return `${k}:${JSON.stringify(v)}`;
    })
    .join(", ");
}

function fmtCall(tool, args) {
  const body = fmtArgs(args);
  return body ? `${tool}({${body}})` : `${tool}({})`;
}

// Strip outer quotes from a shell token.
function unquote(tok) {
  if (tok == null) return "";
  const s = String(tok);
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    return s.slice(1, -1);
  }
  return s;
}

// Best-effort tokenize: whitespace split respecting simple quotes.
function shellTokens(command) {
  const s = String(command || "").trim();
  const out = [];
  let cur = "";
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) q = null;
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      q = c;
      continue;
    }
    if (/\s/.test(c)) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      continue;
    }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

// Flags whose VALUE is the next token; the value must never be taken as a
// pattern or path.
const VALUE_FLAGS = new Set([
  "-e", "--regexp",
  "-f", "--file",
  "-m", "--max-count",
  "--include", "--exclude", "--exclude-dir",
  "-A", "-B", "-C",
  "-g", "-t", "--type", "--glob",
]);

function firstNonFlag(tokens, startIdx) {
  for (let i = startIdx; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "--") {
      if (tokens[i + 1]) return tokens[i + 1];
      return null;
    }
    if (t.startsWith("-")) {
      // -e PATTERN / -f FILE style with attached or next-arg pattern
      if (/^-[^-]*[efm]/.test(t) && t.length > 2 && !t.includes("=")) {
        // e.g. -ePATTERN already attached after short flags (rare); skip attach form
      }
      // flags that take a value as next token
      if (VALUE_FLAGS.has(t)) {
        i += 1;
        continue;
      }
      continue;
    }
    return t;
  }
  return null;
}

/** run is argv-only (no shell): wrap the original line in sh -c. */
function runFallback(raw) {
  return fmtCall("run", { argv: ["sh", "-c", raw] });
}

/** Map a Bash command string to a skyline substitute call string. */
function mapBashCommand(command, root) {
  const raw = String(command || "").trim();
  if (!raw) {
    return runFallback(raw);
  }
  // Use the first pipeline stage for mapping (left of | ; && ||).
  const head = raw.split(/(?:&&|\|\||[|;])/)[0].trim();
  const tokens = shellTokens(head);
  if (tokens.length === 0) {
    return runFallback(raw);
  }
  // skip env assignments: FOO=bar cmd
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  if (i >= tokens.length) return runFallback(raw);
  // skip sudo / env / command / nice
  while (
    i < tokens.length &&
    /^(sudo|env|command|nice|nohup|time)$/.test(tokens[i])
  ) {
    i++;
    // skip sudo flags
    while (i < tokens.length && tokens[i].startsWith("-")) i++;
  }
  if (i >= tokens.length) return runFallback(raw);

  const prog = path.basename(tokens[i]);
  const rest = tokens.slice(i + 1);

  if (prog === "git") {
    // first non-flag = subcommand
    let sub = null;
    let subIdx = -1;
    for (let j = 0; j < rest.length; j++) {
      if (rest[j].startsWith("-")) continue;
      sub = rest[j];
      subIdx = j;
      break;
    }
    if (!sub) return fmtCall("git", {});
    // Post-split (binary-skyline lanes A-E): `git` is READ-ONLY (status,
    // diff, log, show, worktree-list). Writes split by risk class:
    // git_commit (add, commit, merge), git_remote (push, pull, fetch),
    // git_worktree (worktree-add, worktree-remove).
    if (sub === "worktree") {
      let sub2 = null;
      for (let j = subIdx + 1; j < rest.length; j++) {
        if (rest[j].startsWith("-")) continue;
        sub2 = rest[j];
        break;
      }
      if (sub2 === "add") return fmtCall("git_worktree", { subcommand: "worktree-add" });
      if (sub2 === "remove" || sub2 === "prune") return fmtCall("git_worktree", { subcommand: "worktree-remove" });
      return fmtCall("git", { subcommand: "worktree-list" });
    }
    if (sub === "add" || sub === "commit" || sub === "merge") {
      return fmtCall("git_commit", { subcommand: sub });
    }
    if (sub === "push" || sub === "pull" || sub === "fetch") {
      return fmtCall("git_remote", { subcommand: sub });
    }
    return fmtCall("git", { subcommand: sub });
  }

  if (prog === "grep" || prog === "egrep" || prog === "fgrep" || prog === "rg") {
    // pattern: -e X, or first non-flag (after common flags like -rli);
    // value-taking flags skip their next token so `-A 3` never yields "3"
    let pattern = null;
    for (let j = 0; j < rest.length; j++) {
      const t = rest[j];
      if (t === "-e" || t === "--regexp") {
        pattern = rest[j + 1] != null ? rest[j + 1] : null;
        break;
      }
      if (t.startsWith("-e") && t.length > 2) {
        pattern = t.slice(2);
        break;
      }
      if (VALUE_FLAGS.has(t)) {
        j += 1;
        continue;
      }
      if (t.startsWith("-") && t !== "--") continue;
      if (t === "--") {
        pattern = rest[j + 1] != null ? rest[j + 1] : null;
        break;
      }
      pattern = t;
      break;
    }
    if (pattern != null) return fmtCall("grep", { pattern: unquote(pattern) });
    return "grep({pattern:\"…\"})";
  }

  if (
    prog === "cat" ||
    prog === "head" ||
    prog === "tail" ||
    prog === "less" ||
    prog === "more" ||
    prog === "bat"
  ) {
    const file = firstNonFlag(rest, 0);
    // #415 F2: same absolute-path treatment as ls/find below; a relative
    // path resolves against the daemon's cwd (/) and the tool rejects it.
    if (file) return fmtCall("read", { path: resolveAbs(unquote(file), root) });
    return "read({path:\"…\"})";
  }

  if (prog === "find") {
    const target = rest[0] && !rest[0].startsWith("-") ? rest[0] : ".";
    // -name / -iname pattern
    let name = null;
    for (let j = 0; j < rest.length; j++) {
      if ((rest[j] === "-name" || rest[j] === "-iname") && rest[j + 1]) {
        name = unquote(rest[j + 1]);
        break;
      }
    }
    if (name) return fmtCall("find", { glob: name, path: resolveAbs(unquote(target), root) });
    return fmtCall("tree", { path: resolveAbs(unquote(target), root) });
  }

  if (prog === "ls") {
    const p = firstNonFlag(rest, 0) || ".";
    return fmtCall("tree", { path: resolveAbs(unquote(p), root) });
  }

  if (prog === "sed" || prog === "awk" || prog === "perl") {
    return runFallback(raw);
  }

  // default: run with the original command
  return runFallback(raw);
}

function mapNativeSubstitute(mode, ti, toolName, root) {
  if (mode === "read") {
    const p = ti.file_path || ti.path || ti.filePath;
    if (p) return fmtCall("read", { path: String(p) });
    return "read({path:\"…\"})";
  }
  if (mode === "edit") {
    const p = ti.file_path || ti.path || ti.filePath;
    const name = String(toolName || "").toLowerCase();
    // Write → create; Edit → edit. Heuristic: content without old_string ≈ Write.
    const isWrite =
      name === "write" ||
      (ti.content != null && ti.old_string == null && ti.oldString == null);
    if (isWrite) {
      if (p) return fmtCall("create", { path: String(p) });
      return "create({path:\"…\"})";
    }
    // edit takes a ¶path#TAG-anchored patch, not a path: the honest
    // substitute is the read-then-edit flow.
    const read = p
      ? fmtCall("read", { path: String(p) })
      : "read({path:\"…\"})";
    return `${read} then edit with the returned ¶path#TAG anchor`;
  }
  if (mode === "grep") {
    const pattern = ti.pattern == null ? "" : String(ti.pattern);
    const args = { pattern };
    const p = ti.path || ti.file_path;
    if (p) args.path = String(p);
    return fmtCall("grep", args);
  }
  if (mode === "glob") {
    const pattern = ti.pattern == null ? String(ti.glob || "") : String(ti.pattern);
    const args = {};
    if (pattern) args.glob = pattern;
    const p = ti.path || ti.file_path;
    if (p) args.path = String(p);
    if (Object.keys(args).length) return fmtCall("find", args);
    return "find({glob:\"…\"})";
  }
  if (mode === "bash") {
    return mapBashCommand(ti.command || "", root);
  }
  return null;
}

function isSubThreshold(command) {
  if (typeof command !== "string") return false;
  const s = command.trim();
  if (s.length >= 120) return false;
  if (/[|><]/.test(s)) return false;
  return true;
}

// Daemon lifecycle pass-through (L4 hook friction, 2026-07-21).
// A command that starts/stops/restarts the daemon can never be routed THROUGH
// the daemon: run would tear down its own transport mid-call, and the
// hook's advice degenerates into "restart the daemon by asking the daemon".
// An enforcement hook must never be the reason an operator cannot recover a
// dead service, so any pipeline stage naming a lifecycle verb passes through.
// This is not a new escape hatch: short lifecycle commands already passed by
// accident via isSubThreshold(). It makes the pass-through intentional and
// length-independent.
const LIFECYCLE_VERBS = /^(start|stop|restart|install|uninstall|kill-all)$/;
const DAEMON_VALUE_FLAGS =
  /^(-p|--port|-H|--host|--label|--log|--log-file|--timeout|--config|--pid-file)$/;

function isDaemonLifecycle(command, depth = 0) {
  const raw = String(command || "").trim();
  if (!raw || depth > 2) return false;
  for (const stage of raw.split(/(?:&&|\|\||[|;])/)) {
    const tokens = shellTokens(stage.trim());
    let i = 0;
    // same prefix skipping as mapBashCommand: env assignments, then wrappers
    while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
    while (
      i < tokens.length &&
      /^(sudo|env|command|nice|nohup|time)$/.test(path.basename(unquote(tokens[i])))
    ) {
      i++;
      while (i < tokens.length && tokens[i].startsWith("-")) i++;
    }
    if (i >= tokens.length) continue;
    const prog = path.basename(unquote(tokens[i]));
    // `sh -c "skyline daemon restart"` wraps the payload in one quoted token,
    // so recurse into it rather than miss the most common recovery shape.
    if (/^(sh|bash|zsh|dash)$/.test(prog)) {
      const cIdx = tokens.indexOf("-c", i + 1);
      if (cIdx !== -1 && tokens[cIdx + 1] != null) {
        if (isDaemonLifecycle(unquote(tokens[cIdx + 1]), depth + 1)) return true;
      }
      continue;
    }
    if (prog !== "skyline") continue;
    // Flags may sit anywhere, including between `daemon` and the verb. Drop
    // them, and drop the VALUE of a value-taking flag too: without that,
    // `skyline daemon --port 7333 install` reads 7333 as the subcommand.
    const words = [];
    const after = tokens.slice(i + 1).map(unquote);
    for (let j = 0; j < after.length; j++) {
      const t = after[j];
      if (!t.startsWith("-")) {
        words.push(t);
        continue;
      }
      if (DAEMON_VALUE_FLAGS.test(t)) j++; // `--port 7333`; `--port=7333` is one token
    }
    if (words[0] === "daemon" && LIFECYCLE_VERBS.test(words[1] || "")) return true;
  }
  return false;
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

function filePathFromInput(mode, ti) {
  if (mode === "read" || mode === "edit") {
    return ti.file_path || ti.path || ti.filePath || null;
  }
  return null;
}

function toolNameFromInput(input, ti) {
  return (
    input.tool_name ||
    input.toolName ||
    ti.tool_name ||
    ""
  );
}

async function main() {
  const known = { read: 1, edit: 1, grep: 1, glob: 1, bash: 1 };
  if (!known[MODE]) {
    process.exit(0);
  }

  const input = await readToolInput();
  const ti = input.tool_input || input.toolInput || input || {};
  const command = MODE === "bash" ? String(ti.command || "") : "";
  const cwd = input.cwd ? String(input.cwd) : process.cwd();
  const root = projectRoot(input);
  const composer = hasComposer(cwd) || hasComposer(root);
  const toolName = toolNameFromInput(input, ti);

  // Out-of-tree pass-through for native file ops (Read/Edit/Write).
  // Blocking a memory-file write under ~/.claude is out of scope (#706).
  if (MODE === "read" || MODE === "edit") {
    const fp = filePathFromInput(MODE, ti);
    if (fp) {
      const abs = resolveAbs(fp, cwd);
      if (abs && !isInsideTree(abs, root)) {
        process.exit(0);
      }
    }
  }

  // Symbol-hunt detection for R2 steering append (only on grep/bash).
  let pattern = "";
  let glob = "";
  if (MODE === "grep") {
    pattern = String(ti.pattern == null ? "" : ti.pattern);
    glob = String(ti.glob || ti.type || "");
  } else if (MODE === "bash" && /grep|rg/i.test(command)) {
    const m = command.match(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/);
    if (m) {
      pattern = m[1] || m[2] || "";
    } else {
      // fall back to token extract
      const mapped = mapBashCommand(command, root);
      const pm = mapped && mapped.match(/pattern:"((?:\\.|[^"\\])*)"/);
      if (pm) pattern = pm[1].replace(/\\"/g, '"');
    }
  }
  const trimmedP = pattern.trim();
  const isSymHunt = !!(trimmedP && isSymbolHunt(trimmedP) && !targetsNonCode(glob));
  let huntLang = "generic";
  if (isSymHunt) {
    huntLang = routeLang(trimmedP, glob, cwd);
  }

  if (MODE === "bash" && isSubThreshold(command)) {
    // size threshold: skip the nudge entirely for trivial commands
    process.exit(0);
  }

  // Daemon lifecycle pass-through: never redirect the command that would
  // recover the daemon into a call that depends on the daemon.
  if (MODE === "bash" && isDaemonLifecycle(command)) {
    process.stderr.write(
      "skyline daemon lifecycle command; allowing native tool " +
        "(run cannot restart its own transport)\n"
    );
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

  // Exact substitute — ALWAYS present on deny (#706 / field #9).
  const substitute = mapNativeSubstitute(MODE, ti, toolName, root);
  const nativeLabel =
    MODE === "bash"
      ? `Bash \`${command.length > 80 ? command.slice(0, 77) + "..." : command}\``
      : MODE === "read"
        ? "Read"
        : MODE === "edit"
          ? String(toolName || "Edit/Write")
          : MODE === "grep"
            ? "Grep"
            : MODE === "glob"
              ? "Glob"
              : MODE;

  let outMsg = `Use ${substitute} instead of ${nativeLabel}.`;

  // ToolSearch select string — unconditional (#706 acceptance b).
  outMsg += " " + toolSearchLine(composer);

  // Field #11 plugin-side: long symbol-hunt / orient reminder only on first
  // occurrence. The marker burns only when a symbol-hunt denial actually
  // fires; any other denial leaves it untouched. Subsequent denials keep
  // substitute + ToolSearch (never the dead one-liner).
  if ((MODE === "grep" || MODE === "bash") && isSymHunt) {
    if (isFirstReminder()) {
      const steer =
        huntLang === "php"
          ? " Symbol hunt? symbol_card(path, line, symbol) answers declaration + true callers + resolution in one call; definition / references also work. Text grep over-counts comments/strings."
          : " Symbol hunt? Prefer definition / references / implementation over text grep.";
      outMsg += steer;
    } else {
      outMsg += " (symbol-hunt reminder omitted; already shown this session)";
    }
  }

  process.stderr.write(outMsg + "\n");
  process.exit(2);
}

main().catch(() => {
  // never let an error in hook wedge the agent
  process.exit(0);
});
