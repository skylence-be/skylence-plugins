// Blind-probe scrollback classifier (ACUITY-DISCOVER L5 / plugins#16).
// Pure, dependency-free (node stdlib). Given raw Solo scrollback text from a
// blind PHP-LSP discoverability probe, extract the ordered skyline tool-call
// sequence and emit the adoption metrics fixed in design pad 226 §2-L5 + §3.
//
// Fidelity note: Solo raw scrollback is an alternate-screen capture. Lines are
// redrawn and duplicated. The stable signal is the tool-invocation marker line
//   `plugin:skyline-claude:skyline - <tool> (MCP)(<args>)`
// which carries clean tool name + args. We dedup by full call signature so
// redraw repeats collapse to one distinct call. Exact repeat COUNTS are not
// recoverable from scrollback (a genuine second identical call is
// indistinguishable from a redraw), so distinct-call counts are the authoritative
// unit and `semantic_used` (a set-membership question) is the GATE-B input.

// Semantic navigation tools (the acuity-backed answers grep cannot give,
// the §3 nav set). Using ANY of these on a symbol task is "semantic adoption".
export const SEMANTIC_TOOLS = new Set([
  "skyline_symbol_card",
  "skyline_references",
  "skyline_definition",
  "skyline_implementation",
  "skyline_type_definition",
  "skyline_call_hierarchy",
  "skyline_type_hierarchy",
  "skyline_symbols",
]);

// Text/positional tools: grep habit plus plain reads.
export const TEXT_TOOLS = new Set(["skyline_grep", "skyline_read"]);

// The five fixed probe tasks (pad 226 §2-L5). kind drives what a "good" answer
// looks like: symbol tasks reward semantic tools, text tasks must NOT nudge.
export const TASKS = {
  T1: { kind: "php-symbol", desc: "User model shape / extends" },
  T2: { kind: "php-symbol", desc: "usages / blast-radius (caller count)" },
  T3: { kind: "php-symbol", desc: "multi-User disambiguation / resolution" },
  T4: { kind: "rustgo-symbol", desc: "rust/go symbol task (generalization control)" },
  T5: { kind: "text", desc: "pure text config-key hunt (false-positive control)" },
};

function classifyTool(tool) {
  if (SEMANTIC_TOOLS.has(tool)) return "semantic";
  if (TEXT_TOOLS.has(tool)) return "text";
  return "other";
}

// Normalize a call's arg string for dedup: collapse whitespace, drop trailing
// ellipsis/truncation furniture Solo adds when a line is clipped.
function normArgs(s) {
  return (s || "")
    .replace(/[….]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Extract the ordered, redraw-deduped distinct tool calls from raw scrollback.
// Returns [{ tool, args, kind }] in first-seen order.
export function parseCalls(raw) {
  const marker = /(skyline_[a-z_]+)\s*\(MCP\)([^\n]*)/g;
  const seen = new Set();
  const calls = [];
  for (const line of String(raw).split(/\r?\n/)) {
    marker.lastIndex = 0;
    let m;
    while ((m = marker.exec(line)) !== null) {
      const tool = m[1];
      // Trailing text after "(MCP)" holds the args when rendered inline. Keep
      // only up to the next marker on the same line (rare, but redraws pack them).
      let rest = m[2] || "";
      const nextIdx = rest.search(/skyline_[a-z_]+\s*\(MCP\)/);
      if (nextIdx !== -1) rest = rest.slice(0, nextIdx);
      const args = normArgs(rest);
      const sig = tool + " " + args;
      if (seen.has(sig)) continue;
      seen.add(sig);
      calls.push({ tool, args, kind: classifyTool(tool) });
    }
  }
  return calls;
}

// T2 caller-count parity: did the agent report the semantic true caller count
// (404-class, from skyline_symbol_card) or a raw text-match over-count
// (633-class, from grep)? Scans the answer text for the two signals.
export function t2CallerParity(raw) {
  const s = String(raw);
  const has404 = /\b404\b/.test(s);
  const has633 = /\b633\b/.test(s);
  let cls = "unknown";
  if (has404 && !has633) cls = "semantic-404";
  else if (has633 && !has404) cls = "text-633";
  else if (has404 && has633) cls = "mixed";
  return { class: cls, has404, has633 };
}

// T5 false-positive control: the PHP nudge (pad 226 §2-L1) must NOT fire during
// a pure text hunt. Cross-checks the nudge fire-log (JSONL of
// {ts,session_id,pattern,lang,fire_n}) for any lang=="php" fire in this session.
export function t5NudgeCrosscheck(fireLogText, sessionId) {
  const fires = [];
  for (const line of String(fireLogText || "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    let rec;
    try {
      rec = JSON.parse(t);
    } catch {
      continue; // tolerate partial/interleaved writes
    }
    if (sessionId && rec.session_id !== sessionId) continue;
    fires.push(rec);
  }
  const phpFires = fires.filter((f) => f.lang === "php");
  return {
    session_scoped: Boolean(sessionId),
    total_fires: fires.length,
    php_fires: phpFires.length,
    pass: phpFires.length === 0,
    fired_langs: [...new Set(fires.map((f) => f.lang))],
  };
}

// Full classification. `opts`: { agent, sessionId, nudgeLogText }.
export function classify(raw, opts = {}) {
  const calls = parseCalls(raw);
  const semanticCalls = calls.filter((c) => c.kind === "semantic");
  const textCalls = calls.filter((c) => c.kind === "text");
  const semanticUsed = semanticCalls.length > 0;

  // Distinct skyline_grep calls before the first semantic call (grep-habit depth).
  let grepBeforeFirstSemantic = 0;
  for (const c of calls) {
    if (c.kind === "semantic") break;
    if (c.tool === "skyline_grep") grepBeforeFirstSemantic += 1;
  }

  // Per-task flags. Per-task tool attribution is not cleanly recoverable from
  // batched scrollback, so symbol-task semantic adoption is reported at session
  // level (best-effort), documented in protocol.md.
  const tasks = {};
  for (const [id, spec] of Object.entries(TASKS)) {
    const isSymbol = spec.kind === "php-symbol" || spec.kind === "rustgo-symbol";
    tasks[id] = {
      kind: spec.kind,
      desc: spec.desc,
      semantic_used: isSymbol ? semanticUsed : false,
      attribution: "session-level (best-effort)",
    };
  }

  const t2 = t2CallerParity(raw);
  const t5 = t5NudgeCrosscheck(opts.nudgeLogText, opts.sessionId);

  // GATE-B PROBE bar (§3): semantic on >=2/3 PHP tasks incl. T3, T5 zero php
  // nudge, T4 uses a semantic nav tool. Session-level approximation.
  const phpSemantic = ["T1", "T2", "T3"].filter((t) => tasks[t].semantic_used).length;
  const gateB = {
    php_semantic_tasks: phpSemantic,
    t3_semantic: tasks.T3.semantic_used,
    t4_semantic: tasks.T4.semantic_used,
    t5_zero_php_nudge: t5.pass,
    pass:
      phpSemantic >= 2 &&
      tasks.T3.semantic_used &&
      tasks.T4.semantic_used &&
      t5.pass,
  };

  return {
    agent: opts.agent || null,
    session_id: opts.sessionId || null,
    generated_at: new Date().toISOString(),
    distinct_calls: calls,
    semantic_tools_used: [...new Set(semanticCalls.map((c) => c.tool))],
    text_tools_used: [...new Set(textCalls.map((c) => c.tool))],
    semantic_used_session: semanticUsed,
    distinct_call_count: calls.length,
    grep_count_before_first_semantic: grepBeforeFirstSemantic,
    tasks,
    t2_caller_parity: t2,
    t5_nudge_crosscheck: t5,
    gate_b: gateB,
  };
}

// Render a human-readable markdown adoption report from a classify() result.
export function toMarkdown(r) {
  const yn = (b) => (b ? "yes" : "no");
  const lines = [];
  lines.push(`# Discover-probe adoption report`);
  lines.push("");
  lines.push(`- agent: \`${r.agent ?? "?"}\``);
  lines.push(`- session_id: \`${r.session_id ?? "?"}\``);
  lines.push(`- generated_at: ${r.generated_at}`);
  lines.push("");
  lines.push(`## Verdict`);
  lines.push(`- semantic tool used (session): **${yn(r.semantic_used_session)}**`);
  lines.push(`- distinct tool calls: ${r.distinct_call_count}`);
  lines.push(`- grep calls before first semantic call: ${r.grep_count_before_first_semantic}`);
  lines.push(`- semantic tools: ${r.semantic_tools_used.join(", ") || "(none)"}`);
  lines.push(`- text tools: ${r.text_tools_used.join(", ") || "(none)"}`);
  lines.push(`- GATE-B pass: **${yn(r.gate_b.pass)}**`);
  lines.push("");
  lines.push(`## Per-task (attribution: session-level best-effort)`);
  for (const [id, t] of Object.entries(r.tasks)) {
    lines.push(`- **${id}** (${t.kind}), ${t.desc}: semantic_used=${yn(t.semantic_used)}`);
  }
  lines.push("");
  lines.push(`## T2 caller-count parity`);
  lines.push(`- class: **${r.t2_caller_parity.class}** (404 seen: ${yn(r.t2_caller_parity.has404)}, 633 seen: ${yn(r.t2_caller_parity.has633)})`);
  lines.push("");
  lines.push(`## T5 nudge cross-check`);
  lines.push(`- php nudge fires this session: ${r.t5_nudge_crosscheck.php_fires} (pass: ${yn(r.t5_nudge_crosscheck.pass)})`);
  lines.push(`- fired langs: ${r.t5_nudge_crosscheck.fired_langs.join(", ") || "(none)"}`);
  lines.push("");
  lines.push(`## Ordered distinct tool calls`);
  r.distinct_calls.forEach((c, i) => {
    lines.push(`${i + 1}. \`${c.tool}\` [${c.kind}] ${c.args}`.trimEnd());
  });
  lines.push("");
  return lines.join("\n");
}
