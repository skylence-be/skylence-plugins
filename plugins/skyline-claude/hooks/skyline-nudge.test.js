// node:test for skyline-nudge.js nudge-v2 (skylence-plugins#15, design pad 226
// §2 L1). Run with: node --test plugins/skyline-claude/hooks/skyline-nudge.test.js
// Covers: the pinned 1260-probe regression cases (php-symbol classification,
// language routing, non-code suppression), the session anti-nag cap sequence,
// allow-only output, and the unwritable-tmpdir fail-open path.
// Self-contained; each case runs in its own temp TMPDIR so counters/fire-log
// stay isolated, and cleans up after itself.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOOK = path.resolve(__dirname, "skyline-nudge.js");

// A fresh TMPDIR per run isolates the session counter and the fire-log.
function freshTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nudge-test-"));
}

// A directory carrying a language marker file (composer.json / Cargo.toml / ...).
function markerDir(file) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nudge-marker-"));
  fs.writeFileSync(path.join(d, file), "{}");
  return d;
}

function run(input, env = {}) {
  return spawnSync(process.execPath, [HOOK], {
    encoding: "utf8",
    input: JSON.stringify(input),
    env: { ...process.env, ...env },
  });
}

function outContext(res) {
  const s = res.stdout.trim();
  if (!s) return null;
  const parsed = JSON.parse(s);
  // allow-only invariant: every emitted decision must be "allow".
  assert.equal(
    parsed.hookSpecificOutput.permissionDecision,
    "allow",
    "nudge output must be allow-only"
  );
  return parsed.hookSpecificOutput.additionalContext;
}

function input({ pattern, glob, cwd, session_id }) {
  const ti = { pattern };
  if (glob) ti.glob = glob;
  const o = { tool_input: ti };
  if (cwd) o.cwd = cwd;
  o.session_id = session_id || "sess-" + Math.random().toString(36).slice(2);
  return o;
}

// --- pinned regression cases (the 1260 probe) ------------------------------

test("`class User` decl in a composer.json cwd => php-symbol message (was silent)", () => {
  const tmp = freshTmp();
  const php = markerDir("composer.json");
  const ctx = outContext(
    run(input({ pattern: "^\\s*(final\\s+)?class User\\b", cwd: php }), {
      TMPDIR: tmp,
    })
  );
  assert.ok(ctx, "a nudge fired (previously silent)");
  assert.match(ctx, /is a PHP symbol hunt/, "routed to the PHP message");
  assert.match(ctx, /Run the check: take one hit \(path \+ line\) and call skyline_symbol_card/);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(php, { recursive: true, force: true });
});

test("`use App\\Models\\User` import hunt => php-symbol message (was silent)", () => {
  const tmp = freshTmp();
  const ctx = outContext(
    run(input({ pattern: "use App\\Models\\User" }), { TMPDIR: tmp })
  );
  assert.ok(ctx, "a nudge fired");
  assert.match(ctx, /is a PHP symbol hunt/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("`Webkul\\Security\\Models\\User` qualified name => php-symbol message", () => {
  const tmp = freshTmp();
  const ctx = outContext(
    run(input({ pattern: "Webkul\\Security\\Models\\User" }), { TMPDIR: tmp })
  );
  assert.ok(ctx, "a nudge fired");
  assert.match(ctx, /is a PHP symbol hunt/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("config-key grep scoped to a .yaml glob stays silent", () => {
  const tmp = freshTmp();
  const res = run(
    input({ pattern: "SKYLINE_ACUITY_MCP_PHP", glob: "*.yaml" }),
    { TMPDIR: tmp }
  );
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), "", "no nudge for a non-code glob");
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("rust declaration in a Cargo.toml cwd => rust/go (generic five-tool) message", () => {
  const tmp = freshTmp();
  const rust = markerDir("Cargo.toml");
  const ctx = outContext(
    run(input({ pattern: "struct Config", cwd: rust }), { TMPDIR: tmp })
  );
  assert.ok(ctx, "a nudge fired");
  assert.doesNotMatch(ctx, /PHP symbol hunt/, "not the PHP message");
  assert.match(
    ctx,
    /Run the check: call skyline_references, skyline_definition, or skyline_implementation/,
    "the check-prescription rust/go message"
  );
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(rust, { recursive: true, force: true });
});

test("no-marker cwd + plain identifier => generic message", () => {
  const tmp = freshTmp();
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), "nudge-plain-"));
  const ctx = outContext(
    run(input({ pattern: "fooBar", cwd: plain }), { TMPDIR: tmp })
  );
  assert.ok(ctx, "a nudge fired");
  assert.doesNotMatch(ctx, /PHP symbol hunt/);
  assert.match(ctx, /looks like a SYMBOL search/);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(plain, { recursive: true, force: true });
});

// --- anti-nag cap ----------------------------------------------------------

test("session cap: fire 1 full, fires 2-3 one-liner, fire 4+ silent", () => {
  const tmp = freshTmp();
  const sess = "cap-session-fixed";
  const call = () =>
    run(input({ pattern: "use App\\Models\\User", session_id: sess }), {
      TMPDIR: tmp,
    });

  const c1 = outContext(call());
  assert.match(c1, /is a PHP symbol hunt/, "fire 1 is the full message");

  const c2 = outContext(call());
  assert.equal(c2, ONE_LINER, "fire 2 is the one-liner");

  const c3 = outContext(call());
  assert.equal(c3, ONE_LINER, "fire 3 is the one-liner");

  const r4 = call();
  assert.equal(r4.status, 0);
  assert.equal(r4.stdout.trim(), "", "fire 4 is silent");

  const r5 = call();
  assert.equal(r5.stdout.trim(), "", "fire 5 stays silent");

  fs.rmSync(tmp, { recursive: true, force: true });
});

const ONE_LINER =
  "Reminder: before counting call sites from grep, reconcile with skyline_references and treat name_only or unproven hits as unconfirmed until you check the receiver.";

// --- fail-open -------------------------------------------------------------

test("unwritable tmpdir still exits 0 with a nudge (fail-open)", () => {
  // Point TMPDIR at a path that cannot be written: os.tmpdir() returns it, and
  // every counter/fire-log write throws and is swallowed.
  const bad = path.join(os.tmpdir(), "nudge-does-not-exist-" + Date.now(), "x");
  const res = run(input({ pattern: "use App\\Models\\User" }), { TMPDIR: bad });
  assert.equal(res.status, 0, "fail-open exit 0");
  const ctx = outContext(res);
  assert.match(ctx, /is a PHP symbol hunt/, "still nudges (treated as fire 1)");
});

// --- fire-log --------------------------------------------------------------

test("fire-log JSONL records {ts, session_id, pattern, lang, fire_n}", () => {
  const tmp = freshTmp();
  run(input({ pattern: "use App\\Models\\User", session_id: "log-sess" }), {
    TMPDIR: tmp,
  });
  const log = path.join(tmp, "skyline-nudge-fires.jsonl");
  assert.ok(fs.existsSync(log), "fire-log written");
  const rec = JSON.parse(fs.readFileSync(log, "utf8").trim().split("\n")[0]);
  assert.equal(rec.session_id, "log-sess");
  assert.equal(rec.lang, "php");
  assert.equal(rec.fire_n, 1);
  assert.ok(typeof rec.ts === "string" && rec.ts.length > 0);
  assert.equal(rec.pattern, "use App\\Models\\User");
  fs.rmSync(tmp, { recursive: true, force: true });
});
