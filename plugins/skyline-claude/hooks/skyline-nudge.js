// PreToolUse NUDGE (binary-skyline#467): when a skyline_grep looks like a SYMBOL
// search on code, inject a steering reminder toward the exact semantic tools,
// WITHOUT blocking. Text-pattern greps (string literals, route names, config
// keys, TODOs) pass through silently. This is the deliberate counterpart to
// skyline-enforce's hard block: there is always a skyline equivalent for
// Read/Edit/Write, but grep-on-code is sometimes the right tool (the dynamic /
// framework gaps the analyzer cannot model), so here we nudge, never deny.
//
// nudge-v2 (skylence-plugins#15, design pad 226 §2 L1): language-aware routing
// (PHP vs rust/go vs generic), a PHP card-first message with a concrete call
// template, a session-scoped anti-nag cap (full -> one-liner -> silent), and a
// best-effort JSONL fire-log for the measurement plan.
//
// Output: allow + additionalContext (a system reminder). Never emits "deny".
// Fail-open: any parse/fs problem or non-matching pattern exits 0 silently.
// Fires on the skyline_grep MCP tool (native Grep is already redirected by
// skyline-enforce), so the skyline daemon is necessarily up; no liveness probe.

const fs = require("fs");
const os = require("os");
const path = require("path");

// --- symbol-hunt detection -------------------------------------------------
// A grep pattern is a symbol hunt if it looks like a declaration/identifier
// search rather than a literal-text search. The original detectors are kept;
// nudge-v2 adds PHP import hunts, normalized declaration hunts, and member hunts.

function looksLikeSymbol(p) {
  if (!p) return false;
  const s = p.trim();
  if (!s) return false;
  // declaration-style symbol search: keyword + a single identifier
  if (
    /^(function|func|fn|def|class|interface|trait|struct|impl|type|enum|module|namespace|method)\s+[A-Za-z_]\w*$/.test(
      s
    )
  )
    return true;
  // bare identifier: Foo, fooBar, foo_bar
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) return true;
  // qualified identifier: Foo::bar, foo->bar, foo.bar, Foo\Bar
  if (/^[A-Za-z_][A-Za-z0-9_]*(?:(?:::|->|\.|\\)[A-Za-z_][A-Za-z0-9_]*)+$/.test(s))
    return true;
  return false;
}

// (a) PHP import hunt: matches `use App\Models\User`.
function isImportHunt(p) {
  return /^use\s+[A-Za-z_][A-Za-z0-9_]*(\\[A-Za-z_][A-Za-z0-9_]*)+/.test(p);
}

// Strip regex furniture so a declaration-style pattern like
// `^\s*(final\s+)?class User\b` reduces to plain `class User` before matching.
function stripRegexFurniture(s) {
  return s.replace(
    /\\[sbBdwW]|\((?:\?[:i=!]*)?|\)|[\^\$\?\+\*\|]|\{\d*,?\d*\}|\[[^\]]*\]/g,
    " "
  );
}

// (b) normalized declaration hunt (php/rust/go/generic keywords).
function isDeclHunt(p) {
  return /(?:^|\s)(class|interface|trait|enum|function|fn|func|def|struct|impl|type)\s+([A-Za-z_]\w*)/.test(
    stripRegexFurniture(p)
  );
}

// (c) member/method hunt: `User::posts`, `user->posts`, `foo.bar` (after strip).
function isMemberHunt(p) {
  return /^[A-Za-z_$][\w$]*(::|->|\.)[A-Za-z_]\w*$/.test(
    stripRegexFurniture(p).trim()
  );
}

function isSymbolHunt(p) {
  if (!p) return false;
  return (
    looksLikeSymbol(p) || isImportHunt(p) || isDeclHunt(p) || isMemberHunt(p)
  );
}

// Suppress the nudge when the search is explicitly scoped to non-code files
// (docs / config / data): there the LSP has nothing to offer and grep is right.
function targetsNonCode(glob) {
  if (!glob) return false;
  return /\.(md|markdown|mdx|txt|rst|json|ya?ml|toml|ini|cfg|conf|env|lock|csv|tsv|html?|xml|svg|css|scss|less)(\b|$|["',}\])])/i.test(
    glob
  );
}

// --- language routing ------------------------------------------------------
// Signal precedence (design pad 226 §2 L1): pattern/glob signals outrank cwd
// markers. skyline LSP is php/rust/go-only, so anything else stays generic;
// recommending dead tools is the false-positive mode we avoid.
function routeLang(pattern, glob, cwd) {
  const globPhp = /\.php\b/i.test(glob);
  const globRustGo = /\.(rs|go)\b/.test(glob);
  const nsSig = /[A-Za-z_]\\[A-Za-z_]/.test(pattern);
  // highest precedence: pattern/glob signals
  if (globPhp || isImportHunt(pattern) || nsSig) return "php";
  if (globRustGo) return "rust-go";
  // lower precedence: cwd project markers
  if (cwd) {
    try {
      if (fs.existsSync(path.join(cwd, "composer.json"))) return "php";
      if (
        fs.existsSync(path.join(cwd, "Cargo.toml")) ||
        fs.existsSync(path.join(cwd, "go.mod"))
      )
        return "rust-go";
    } catch (_e) {
      // fail-open: any fs error => fall through to generic
    }
  }
  return "generic";
}

// --- anti-nag cap ----------------------------------------------------------
// Session-scoped counter under tmpdir. fire 1 => full message, fires 2-3 =>
// one-liner, fires >3 => silent. Any fs error => treat as fire 1 (fail-open).
function bumpFire(sessionId) {
  const key = String(sessionId || "unknown").replace(/[^a-z0-9_-]/gi, "_");
  try {
    const f = path.join(os.tmpdir(), `skyline-nudge-${key}.n`);
    let n = 0;
    try {
      n = parseInt(String(fs.readFileSync(f, "utf8")).trim(), 10) || 0;
    } catch (_e) {
      n = 0; // absent/unreadable counter => this is the first fire
    }
    n += 1;
    try {
      fs.writeFileSync(f, String(n));
    } catch (_e) {
      // unwritable tmpdir: still return the computed number, still nudge
    }
    return n;
  } catch (_e) {
    return 1;
  }
}

// --- self-instrumentation --------------------------------------------------
// Best-effort JSONL fire-log for the measurement plan. Never throws.
function logFire(rec) {
  try {
    fs.appendFileSync(
      path.join(os.tmpdir(), "skyline-nudge-fires.jsonl"),
      JSON.stringify(rec) + "\n"
    );
  } catch (_e) {
    /* best-effort: measurement input, never a failure surface */
  }
}

// --- messages --------------------------------------------------------------
// PHP card-first message (fire 1): pipeline recipe + a concrete call template.
function phpMessage(pattern) {
  return `That skyline_grep pattern ("${pattern}") is a PHP symbol hunt. skyline_symbol_card answers it in ONE call: take any grep hit (path + line) and call skyline_symbol_card(path, line, symbol) — you get the declaration, signature, the resolution trace across same-named candidates (with excluded ones), the true caller count, implementations, and tests, instead of hand-counting text matches (text counts over-count comments/strings and miss fully-qualified refs). "Who uses this" → skyline_references; "where is it defined" → skyline_definition. Genuinely searching literal TEXT (a string, a route, a config key)? Ignore this and proceed.`;
}

// rust/go + generic message (fire 1): the original five-tool steering text.
function genericMessage(pattern) {
  return `That skyline_grep pattern ("${pattern}") looks like a SYMBOL search, not a text search. For structural questions — where is X defined, who calls Y, what implements this interface, what type is this, what breaks if I change it — the semantic tools are exact: they will not miss dynamic references or over-match the same word in comments/strings. Prefer skyline_definition / skyline_references / skyline_implementation / skyline_type_definition / skyline_call_hierarchy (or, on an indexed repo, skybox query / context / impact for cross-repo execution flows). If you are genuinely searching for literal TEXT (a string literal, a route name, a config key, a TODO) then grep is correct — ignore this and proceed.`;
}

const ONE_LINER =
  "Reminder: skyline_symbol_card / skyline_references resolve PHP symbols exactly; grep counts mislead.";

// fire 1 => full (language-specific), fires 2-3 => one-liner, fires >3 => silent.
function buildMessage(lang, pattern, fireN) {
  if (fireN >= 4) return null;
  if (fireN >= 2) return ONE_LINER;
  return lang === "php" ? phpMessage(pattern) : genericMessage(pattern);
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  let pattern = "";
  let glob = "";
  let cwd = "";
  let sessionId = "";
  try {
    const input = JSON.parse(buf || "{}");
    const ti = input.tool_input || input.toolInput || {};
    pattern = ti.pattern == null ? "" : String(ti.pattern);
    glob = String(ti.glob || ti.type || "");
    cwd = input.cwd == null ? "" : String(input.cwd);
    sessionId = input.session_id == null ? "" : String(input.session_id);
  } catch (_e) {
    process.exit(0); // unparseable input -> do nothing
  }

  const trimmed = pattern.trim();
  if (!isSymbolHunt(trimmed) || targetsNonCode(glob)) process.exit(0);

  const lang = routeLang(trimmed, glob, cwd);
  const fireN = bumpFire(sessionId);
  logFire({
    ts: new Date().toISOString(),
    session_id: sessionId || null,
    pattern: trimmed,
    lang,
    fire_n: fireN,
  });

  const message = buildMessage(lang, trimmed, fireN);
  if (!message) process.exit(0); // capped -> silent, still fail-open exit 0

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        additionalContext: message,
      },
    }) + "\n"
  );
  process.exit(0);
});
