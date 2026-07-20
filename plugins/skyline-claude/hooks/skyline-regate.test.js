/**
 * Unit matrix for skyline-regate.js: emits the one-line guide re-gate on the
 * compaction path only; silent on plain session starts and malformed input.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const HOOK = path.join(__dirname, "skyline-regate.js");

function runHook(stdin) {
  const res = spawnSync("node", [HOOK], { input: stdin, encoding: "utf8" });
  return { code: res.status, out: res.stdout || "" };
}

test("compact source emits the re-gate context", () => {
  const { code, out } = runHook(JSON.stringify({ source: "compact" }));
  assert.strictEqual(code, 0);
  const parsed = JSON.parse(out);
  const ctx = parsed.hookSpecificOutput.additionalContext;
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(ctx, /skyline:\/\/guide/);
  assert.match(ctx, /ready_semantic/);
  assert.match(ctx, /skyline_lore_recall/);
});

test("startup source stays silent", () => {
  const { code, out } = runHook(JSON.stringify({ source: "startup" }));
  assert.strictEqual(code, 0);
  assert.strictEqual(out, "");
});

test("resume source stays silent", () => {
  const { code, out } = runHook(JSON.stringify({ source: "resume" }));
  assert.strictEqual(code, 0);
  assert.strictEqual(out, "");
});

test("absent source emits (matcher already gated the event)", () => {
  const { code, out } = runHook("{}");
  assert.strictEqual(code, 0);
  assert.match(out, /skyline:\/\/guide/);
});

test("malformed input is silently ignored", () => {
  const { code, out } = runHook("{nope");
  assert.strictEqual(code, 0);
  assert.strictEqual(out, "");
});