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
// PHP-oriented skyline_symbol_card to the on-ramp menu plus a one-sentence note.
// Fail-open: any fs/cwd error just omits the augmentation (no throw, no block).
function hasComposer(cwd) {
  try {
    const base = cwd || process.cwd();
    return fs.existsSync(path.join(base, "composer.json"));
  } catch (_e) {
    return false;
  }
}

// The CORE menu the switch instruction points agents at. The three semantic
// navigators (definition/references/symbols) are language-generic and always
// listed (skylence-plugins#15 on-ramp). skyline_symbol_card is PHP-oriented.
function buildCore(composer) {
  return (
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
    (composer ? ",mcp__plugin_skyline-claude_skyline__skyline_symbol_card" : "")
  );
}

function toolSearchLine(composer) {
  const php = composer
    ? " PHP project: skyline_symbol_card answers symbol questions (declaration + callers + resolution) in one call."
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

function isInsideTree(absPath, root) {
  if (!absPath || !root) return true; // unknown path => enforce (fail closed for in-repo tools)
  const a = path.resolve(absPath);
  const r = path.resolve(root);
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
        // e.g. -ePATTERN already attached after short flags — rare; skip attach form
      }
      // flags that take a value as next token
      if (
        t === "-e" ||
        t === "--regexp" ||
        t === "-f" ||
        t === "--file" ||
        t === "-m" ||
        t === "--max-count" ||
        t === "--include" ||
        t === "--exclude" ||
        t === "--exclude-dir" ||
        t === "-A" ||
        t === "-B" ||
        t === "-C" ||
        t === "-g" ||
        t === "-t" ||
        t === "--type" ||
        t === "--glob"
      ) {
        i += 1;
        continue;
      }
      continue;
    }
    return t;
  }
  return null;
}

/** Map a Bash command string to a skyline substitute call string. */
function mapBashCommand(command) {
  const raw = String(command || "").trim();
  if (!raw) {
    return fmtCall("skyline_run", { command: raw });
  }
  // Use the first pipeline stage for mapping (left of | ; && ||).
  const head = raw.split(/(?:&&|\|\||[|;])/)[0].trim();
  const tokens = shellTokens(head);
  if (tokens.length === 0) {
    return fmtCall("skyline_run", { command: raw });
  }
  // skip env assignments: FOO=bar cmd
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  if (i >= tokens.length) return fmtCall("skyline_run", { command: raw });
  // skip sudo / env / command / nice
  while (
    i < tokens.length &&
    /^(sudo|env|command|nice|nohup|time)$/.test(tokens[i])
  ) {
    i++;
    // skip sudo flags
    while (i < tokens.length && tokens[i].startsWith("-")) i++;
  }
  if (i >= tokens.length) return fmtCall("skyline_run", { command: raw });

  const prog = path.basename(tokens[i]);
  const rest = tokens.slice(i + 1);

  if (prog === "git") {
    // first non-flag = subcommand
    let sub = null;
    for (const t of rest) {
      if (t.startsWith("-")) continue;
      sub = t;
      break;
    }
    if (sub) return fmtCall("skyline_git", { subcommand: sub });
    return fmtCall("skyline_git", {});
  }

  if (prog === "grep" || prog === "egrep" || prog === "fgrep" || prog === "rg") {
    // pattern: -e X, or first non-flag (after common flags like -rli)
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
      if (t.startsWith("-") && t !== "--") continue;
      if (t === "--") {
        pattern = rest[j + 1] != null ? rest[j + 1] : null;
        break;
      }
      pattern = t;
      break;
    }
    if (pattern != null) return fmtCall("skyline_grep", { pattern: unquote(pattern) });
    return "skyline_grep({pattern:\"…\"})";
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
    if (file) return fmtCall("skyline_read", { path: unquote(file) });
    return "skyline_read({path:\"…\"})";
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
    if (name) return fmtCall("skyline_find", { pattern: name, path: unquote(target) });
    return fmtCall("skyline_tree", { path: unquote(target) });
  }

  if (prog === "ls") {
    const p = firstNonFlag(rest, 0) || ".";
    return fmtCall("skyline_tree", { path: unquote(p) });
  }

  if (prog === "sed" || prog === "awk" || prog === "perl") {
    return fmtCall("skyline_run", { command: raw });
  }

  // default: skyline_run with the original command
  return fmtCall("skyline_run", { command: raw });
}

function mapNativeSubstitute(mode, ti, toolName) {
  if (mode === "read") {
    const p = ti.file_path || ti.path || ti.filePath;
    if (p) return fmtCall("skyline_read", { path: String(p) });
    return "skyline_read({path:\"…\"})";
  }
  if (mode === "edit") {
    const p = ti.file_path || ti.path || ti.filePath;
    const name = String(toolName || "").toLowerCase();
    // Write → create; Edit → edit. Heuristic: content without old_string ≈ Write.
    const isWrite =
      name === "write" ||
      (ti.content != null && ti.old_string == null && ti.oldString == null);
    const tool = isWrite ? "skyline_create" : "skyline_edit";
    if (p) return fmtCall(tool, { path: String(p) });
    return `${tool}({path:"…"})`;
  }
  if (mode === "grep") {
    const pattern = ti.pattern == null ? "" : String(ti.pattern);
    const args = { pattern };
    const p = ti.path || ti.file_path;
    if (p) args.path = String(p);
    return fmtCall("skyline_grep", args);
  }
  if (mode === "glob") {
    const pattern = ti.pattern == null ? String(ti.glob || "") : String(ti.pattern);
    const args = {};
    if (pattern) args.pattern = pattern;
    const p = ti.path || ti.file_path;
    if (p) args.path = String(p);
    if (Object.keys(args).length) return fmtCall("skyline_find", args);
    return "skyline_find({pattern:\"…\"})";
  }
  if (mode === "bash") {
    return mapBashCommand(ti.command || "");
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
      const mapped = mapBashCommand(command);
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
  const substitute = mapNativeSubstitute(MODE, ti, toolName);
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

  // Field #11 plugin-side: long symbol-hunt / orient reminder only on first fire.
  // Subsequent denials keep substitute + ToolSearch (never the dead one-liner).
  const first = isFirstReminder();
  if (first && (MODE === "grep" || MODE === "bash") && isSymHunt) {
    const steer =
      huntLang === "php"
        ? " Symbol hunt? skyline_symbol_card(path, line, symbol) answers declaration + true callers + resolution in one call; skyline_definition / skyline_references also work. Text grep over-counts comments/strings."
        : " Symbol hunt? Prefer skyline_definition / skyline_references / skyline_implementation over text grep.";
    outMsg += steer;
  } else if (!first && (MODE === "grep" || MODE === "bash") && isSymHunt) {
    outMsg += " (symbol-hunt reminder omitted; already shown this session)";
  }

  process.stderr.write(outMsg + "\n");
  process.exit(2);
}

main().catch(() => {
  // never let an error in hook wedge the agent
  process.exit(0);
});
