/**
 * node:test for steering-detect.js (skylence-plugins#20 Deliverable 1).
 * Covers the pinned cases from the contract exactly.
 * Run: node --test plugins/skyline-claude/hooks/steering-detect.test.js
 * Direct module require (no spawn of full hook).
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const detect = require("./steering-detect");
const {
  isSymbolHunt,
  targetsNonCode,
  routeLang,
  looksLikeSymbol,
  isImportHunt,
  isDeclHunt,
  isMemberHunt,
} = detect;

function markerDir(file) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "detect-marker-"));
  fs.writeFileSync(path.join(d, file), "{}");
  return d;
}

function plainDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "detect-plain-"));
}

function cleanup(d) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
}

test("`^\\s*(final\\s+)?class User\\b` gives symbol + php (composer cwd)", () => {
  const p = "^\\s*(final\\s+)?class User\\b";
  const php = markerDir("composer.json");
  try {
    assert.ok(isSymbolHunt(p), "is symbol hunt");
    assert.ok(isDeclHunt(p), "decl hunt via strip");
    assert.equal(routeLang(p, "", php), "php");
  } finally {
    cleanup(php);
  }
});

test("`use App\\Models\\User` gives symbol + php", () => {
  const p = "use App\\Models\\User";
  assert.ok(isSymbolHunt(p), "is symbol hunt");
  assert.ok(isImportHunt(p), "import hunt");
  assert.equal(routeLang(p, "", ""), "php"); // even no cwd, import sig
});

test("`Webkul\\Security\\Models\\User` gives symbol + php", () => {
  const p = "Webkul\\Security\\Models\\User";
  assert.ok(isSymbolHunt(p), "is symbol hunt");
  assert.equal(routeLang(p, "", ""), "php");
});

test("`SKYLINE_ACUITY_MCP_PHP` with glob `*.yaml` is suppressed", () => {
  const p = "SKYLINE_ACUITY_MCP_PHP";
  assert.ok(isSymbolHunt(p), "bare id is symbol hunt");
  assert.ok(targetsNonCode("*.yaml"), "yaml glob suppressed");
  // the combination means nudge would skip
});

test("`struct Config` with Cargo.toml cwd gives symbol + rust-go", () => {
  const p = "struct Config";
  const rust = markerDir("Cargo.toml");
  try {
    assert.ok(isSymbolHunt(p), "is symbol hunt");
    assert.ok(isDeclHunt(p), "decl");
    assert.equal(routeLang(p, "", rust), "rust-go");
  } finally {
    cleanup(rust);
  }
});

test("`fooBar` with no markers gives symbol + generic", () => {
  const p = "fooBar";
  const plain = plainDir();
  try {
    assert.ok(isSymbolHunt(p), "bare id is symbol hunt");
    assert.equal(routeLang(p, "", plain), "generic");
  } finally {
    cleanup(plain);
  }
});

// extra coverage for listed exports
test("looksLikeSymbol, isMemberHunt basic", () => {
  assert.ok(looksLikeSymbol("User"));
  assert.ok(looksLikeSymbol("fooBar"));
  assert.ok(isMemberHunt("User::posts"));
  assert.ok(isMemberHunt("user->bar"));
});
