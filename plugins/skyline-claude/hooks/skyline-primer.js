/**
 * SessionStart primer (skylence-plugins#20 R3).
 * Arms the agent with the right first-tool guidance for symbol questions at session start.
 * Reads stdin JSON; looks for top-level "cwd".
 * Emits ONLY additionalContext on SessionStart hook (no permission decision).
 * Fail-open on any error/parse/fs: exit 0, no output.
 */

const fs = require("fs");
const path = require("path");

function hasMarker(cwd, name) {
  if (!cwd) return false;
  try {
    return fs.existsSync(path.join(cwd, name));
  } catch (_e) {
    return false;
  }
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  let cwd = "";
  try {
    const input = JSON.parse(buf || "{}");
    cwd = input.cwd == null ? "" : String(input.cwd);
  } catch (_e) {
    process.exit(0); // malformed => silent exit 0
  }

  let context = "";
  if (hasMarker(cwd, "composer.json")) {
    context = "Skyline semantic PHP tools are active here. For symbol questions (where is X defined, who calls Y, which same-named class resolves) start with skyline_symbol_card(path, line, symbol), one call for declaration + true callers + resolution trace, or skyline_definition / skyline_references. Use skyline_grep only for literal text; text counts over-count comments/strings.";
  } else if (hasMarker(cwd, "Cargo.toml") || hasMarker(cwd, "go.mod")) {
    context = "Skyline semantic tools active: prefer skyline_definition / skyline_references / skyline_implementation over grep for symbol questions.";
  }

  if (!context) {
    process.exit(0); // no marker or empty => no output
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: context,
      },
    }) + "\n"
  );
  process.exit(0);
});
