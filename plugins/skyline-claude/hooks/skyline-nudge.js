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

// Pull the factored detectors (skylence-plugins#20). Original bodies live in
// steering-detect.js; nudge keeps identical behavior (tests unchanged).
const {
  looksLikeSymbol,
  isImportHunt,
  stripRegexFurniture,
  isDeclHunt,
  isMemberHunt,
  isSymbolHunt,
  targetsNonCode,
  routeLang,
} = require("./steering-detect");

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
// PHP card-first message (fire 1): check-prescription (run the reconcile).
function phpMessage(pattern) {
  return `That skyline_grep pattern ("${pattern}") is a PHP symbol hunt, and a raw text count will mislead you here: it over-counts comments and strings and conflates same-named methods on different classes. Don't conclude from the grep alone. Run the check: take one hit (path + line) and call skyline_symbol_card(path, line, symbol) or skyline_references, then (1) treat any hit tagged name_only as UNCONFIRMED until you verify its receiver type, and (2) if a resolved count disagrees with your grep count, decompose by receiver before trusting either. symbol_card's first line reports the index's own state (provenance and freshness); read it rather than assuming the index is degraded.`;
}

// rust/go + generic message (fire 1): check-prescription for structural greps.
function genericMessage(pattern) {
  return `That skyline_grep pattern ("${pattern}") looks like a SYMBOL search. A text count misleads for structural questions (who calls Y, what implements this, what breaks if I change it): it over-matches comments and strings and misses fully-qualified or dynamic refs. Don't conclude from the grep alone. Run the check: call skyline_references, skyline_definition, or skyline_implementation on one hit; treat any unproven or name_only hit as UNCONFIRMED until you verify its receiver; and if a resolved count disagrees with your grep count, reconcile before trusting either. Read the tool's own freshness and provenance rather than assuming the index is degraded.`;
}

const ONE_LINER =
  "Reminder: before counting call sites from grep, reconcile with skyline_references and treat name_only or unproven hits as unconfirmed until you check the receiver.";

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
