/**
 * SessionStart(compact) re-gate (steering audit gap 7).
 * Compaction evicts the guide text an agent already read; the summary keeps
 * facts, not conduct. Re-inject ONE short line so the next beat re-reads the
 * playbook instead of coasting on a summarized memory of it.
 * Wired with matcher "compact" in hooks.json so it only runs post-compaction;
 * the source check below keeps it silent if the harness ever routes other
 * sources here. Fail-open on any error: exit 0, no output.
 */

const REGATE_CONTEXT =
  "skyline: context was compacted; the guide's text did not survive summarization. " +
  "Re-read skyline://guide before the next edit-class call. Session recipe: " +
  "skyline_tree, then skyline_lore_recall (unscoped), then skyline_lsp_warm once " +
  "for PHP/Rust/Go work (gate on ready_semantic), then skyline_git status.";

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(buf || "{}");
    const source = input.source == null ? "" : String(input.source);
    if (source && source !== "compact") process.exit(0);
  } catch (_e) {
    process.exit(0); // malformed => silent
  }
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: REGATE_CONTEXT,
      },
    }) + "\n"
  );
  process.exit(0);
});