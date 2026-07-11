// node --test  (node stdlib test runner; no deps)
// Fixture test: the classifier reproduces the KNOWN probe-A classification
// (todo 1260 verdict) from the archived proc-1614 blind-probe scrollback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  classify,
  parseCalls,
  t2CallerParity,
  t5NudgeCrosscheck,
} from "./classify.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(here, "fixtures", "probe-a-1614.txt"), "utf8");

test("parseCalls: redraw-dedup yields the 6 distinct probe-A calls", () => {
  const calls = parseCalls(raw);
  const sigs = calls.map((c) => `${c.tool}|${c.kind}`);
  // 4 distinct greps + 2 distinct reads; redraw duplicates collapse.
  assert.equal(calls.length, 6, JSON.stringify(calls, null, 2));
  assert.equal(sigs.filter((s) => s === "skyline_grep|text").length, 4);
  assert.equal(sigs.filter((s) => s === "skyline_read|text").length, 2);
});

test("probe-A verdict: zero semantic adoption, grep habit won", () => {
  const r = classify(raw, { agent: "claude-opus", sessionId: null });
  assert.equal(r.semantic_used_session, false);
  assert.deepEqual(r.semantic_tools_used, []);
  assert.deepEqual(r.text_tools_used.sort(), ["skyline_grep", "skyline_read"]);
  // 4 grep calls before any semantic call (there is none), matching the 1260 verdict.
  assert.equal(r.grep_count_before_first_semantic, 4);
  for (const id of ["T1", "T2", "T3", "T4"]) {
    assert.equal(r.tasks[id].semantic_used, false, id);
  }
  assert.equal(r.gate_b.pass, false);
});

test("T2 caller parity: probe-A is the text-633 over-count class", () => {
  const t2 = t2CallerParity(raw);
  assert.equal(t2.class, "text-633");
  assert.equal(t2.has633, true);
  assert.equal(t2.has404, false);
});

test("T5 nudge cross-check: absent log passes; php fire fails", () => {
  const none = t5NudgeCrosscheck("", "sess-x");
  assert.equal(none.pass, true);
  assert.equal(none.php_fires, 0);

  const log = [
    JSON.stringify({ ts: "t", session_id: "sess-x", pattern: "class User", lang: "php", fire_n: 1 }),
    JSON.stringify({ ts: "t", session_id: "other", pattern: "x", lang: "php", fire_n: 1 }),
  ].join("\n");
  const scoped = t5NudgeCrosscheck(log, "sess-x");
  assert.equal(scoped.php_fires, 1);
  assert.equal(scoped.pass, false);
});

test("t5NudgeCrosscheck tolerates malformed JSONL lines", () => {
  const log = "not json\n" + JSON.stringify({ session_id: "s", lang: "rust", fire_n: 1 });
  const r = t5NudgeCrosscheck(log, "s");
  assert.equal(r.total_fires, 1);
  assert.equal(r.php_fires, 0);
  assert.equal(r.pass, true);
});

// Positive control: a synthetic scrollback where the agent DID adopt semantic
// tools must flip semantic_used and start counting grep-before-semantic.
test("positive control: semantic adoption is detected and ordered", () => {
  const adopted = [
    'plugin:skyline-claude:skyline - skyline_grep (MCP)(pattern: "class User")',
    'plugin:skyline-claude:skyline - skyline_symbol_card (MCP)(path: "app/Models/User.php", line: 11)',
    "  caller_count: 404",
  ].join("\n");
  const r = classify(adopted, { agent: "grok" });
  assert.equal(r.semantic_used_session, true);
  assert.deepEqual(r.semantic_tools_used, ["skyline_symbol_card"]);
  assert.equal(r.grep_count_before_first_semantic, 1);
  assert.equal(r.t2_caller_parity.class, "semantic-404");
});
