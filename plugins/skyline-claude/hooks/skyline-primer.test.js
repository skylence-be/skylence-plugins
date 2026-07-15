// node:test for skyline-primer.js (skylence-plugins#20 R3).
// Run with: node --test plugins/skyline-claude/hooks/skyline-primer.test.js
// Uses spawnSync + temp marker dirs (composer.json / Cargo.toml), like nudge tests.
// Covers: php context, rust/generic context, no-marker empty, malformed stdin => 0 empty.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOOK = path.resolve(__dirname, "skyline-primer.js");

function markerDir(file) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "primer-marker-"));
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

function cleanup(d) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
}

const PHP_CTX = "Skyline semantic PHP tools are active here. For symbol questions (where is X defined, who calls Y, which same-named class resolves), don't conclude from text counts: run skyline_symbol_card(path, line, symbol) or skyline_references and reconcile. A name_only hit is unconfirmed until you verify its receiver, and if symbol_card's count disagrees with a grep count, decompose by receiver. Read symbol_card's provenance and freshness before assuming the index is degraded; use skyline_grep for literal text only.";

const RUST_CTX = "Skyline semantic tools active. For symbol questions, don't conclude from grep counts: run skyline_definition, skyline_references, or skyline_implementation and reconcile any unproven hit by checking its receiver; read the tool's freshness before assuming degradation.";

test("php marker gives the exact php context", () => {
  const php = markerDir("composer.json");
  try {
    const res = run({ cwd: php });
    assert.equal(res.status, 0);
    const s = res.stdout.trim();
    assert.ok(s, "emitted output");
    const parsed = JSON.parse(s);
    assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
    assert.equal(parsed.hookSpecificOutput.additionalContext, PHP_CTX);
    // no permissionDecision per spec
    assert.ok(!("permissionDecision" in parsed.hookSpecificOutput));
  } finally {
    cleanup(php);
  }
});

test("rust marker gives the generic (rust-go) context line", () => {
  const rust = markerDir("Cargo.toml");
  try {
    const res = run({ cwd: rust });
    assert.equal(res.status, 0);
    const s = res.stdout.trim();
    assert.ok(s);
    const parsed = JSON.parse(s);
    assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
    assert.equal(parsed.hookSpecificOutput.additionalContext, RUST_CTX);
  } finally {
    cleanup(rust);
  }
});

test("no marker gives empty stdout", () => {
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), "primer-plain-"));
  try {
    const res = run({ cwd: plain });
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), "", "no output when no marker");
  } finally {
    cleanup(plain);
  }
});

test("malformed stdin exits 0 empty", () => {
  const res = spawnSync(process.execPath, [HOOK], {
    encoding: "utf8",
    input: "{ not json",
  });
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), "");
});
