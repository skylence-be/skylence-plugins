// PreToolUse NUDGE (binary-skyline#467): when a skyline_grep looks like a SYMBOL
// search on code, inject a steering reminder toward the exact semantic tools —
// WITHOUT blocking. Text-pattern greps (string literals, route names, config
// keys, TODOs) pass through silently. This is the deliberate counterpart to
// skyline-enforce's hard block: there is always a skyline equivalent for
// Read/Edit/Write, but grep-on-code is sometimes the right tool (the dynamic /
// framework gaps the analyzer cannot model), so here we nudge, never deny.
//
// Output: allow + additionalContext (a system reminder). Never emits "deny".
// Fail-open: any parse problem or non-matching pattern exits 0 silently.
// Fires on the skyline_grep MCP tool (native Grep is already redirected by
// skyline-enforce), so the skyline daemon is necessarily up — no liveness probe.

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

// Suppress the nudge when the search is explicitly scoped to non-code files
// (docs / config / data) — there the LSP has nothing to offer and grep is right.
function targetsNonCode(glob) {
  if (!glob) return false;
  return /\.(md|markdown|mdx|txt|rst|json|ya?ml|toml|ini|cfg|conf|env|lock|csv|tsv|html?|xml|svg|css|scss|less)(\b|$|["',}\])])/i.test(
    glob
  );
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  let pattern = "";
  let glob = "";
  try {
    const input = JSON.parse(buf || "{}");
    const ti = input.tool_input || input.toolInput || {};
    pattern = (ti.pattern == null ? "" : String(ti.pattern));
    glob = String(ti.glob || ti.type || "");
  } catch (_e) {
    process.exit(0); // unparseable input -> do nothing
  }

  if (!looksLikeSymbol(pattern) || targetsNonCode(glob)) process.exit(0);

  const nudge =
    'That skyline_grep pattern ("' +
    pattern.trim() +
    '") looks like a SYMBOL search, not a text search. For structural questions ' +
    "— where is X defined, who calls Y, what implements this interface, what type " +
    "is this, what breaks if I change it — the semantic tools are exact: they will " +
    "not miss dynamic references or over-match the same word in comments/strings. " +
    "Prefer skyline_definition / skyline_references / skyline_implementation / " +
    "skyline_type_definition / skyline_call_hierarchy (or, on an indexed repo, " +
    "skybox query / context / impact for cross-repo execution flows). " +
    "If you are genuinely searching for literal TEXT (a string literal, a route " +
    "name, a config key, a TODO) then grep is correct — ignore this and proceed.";

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        additionalContext: nudge,
      },
    }) + "\n"
  );
  process.exit(0);
});
