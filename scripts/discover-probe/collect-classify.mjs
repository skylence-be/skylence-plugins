#!/usr/bin/env node
// collect-classify.mjs <run-dir> [--scrollback FILE] [--nudge-log FILE] [--session-id ID]
//
// Reads a captured Solo scrollback dump plus the PHP-nudge fire-log, runs the
// classifier, and writes report.json + report.md into the run directory
// (ACUITY-DISCOVER L5 / plugins#16). Pure node stdlib.
//
// Inputs default to the layout spawn-probe.mjs prepares:
//   <run-dir>/scrollback.txt   (orchestrator dumps get_process_raw_output here)
//   <run-dir>/spawn.json       (manifest; supplies agent + process_name)
//   nudge log: $SKYLINE_NUDGE_FIRELOG or ${os.tmpdir()}/skyline-nudge-fires.jsonl
//              (pad 226 §2-L1)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { classify, toMarkdown } from "./classify.mjs";

function parseArgs(argv) {
  const rest = argv.slice(2);
  const runDir = rest[0];
  const opts = {};
  for (let i = 1; i < rest.length; i++) {
    const k = rest[i];
    if (k === "--scrollback") opts.scrollback = rest[++i];
    else if (k === "--nudge-log") opts.nudgeLog = rest[++i];
    else if (k === "--session-id") opts.sessionId = rest[++i];
  }
  return { runDir, opts };
}

const { runDir, opts } = parseArgs(process.argv);
if (!runDir) {
  console.error("usage: collect-classify.mjs <run-dir> [--scrollback FILE] [--nudge-log FILE] [--session-id ID]");
  process.exit(2);
}

const scrollbackPath = opts.scrollback || join(runDir, "scrollback.txt");
if (!existsSync(scrollbackPath)) {
  console.error(`no scrollback at ${scrollbackPath} — dump get_process_raw_output there first.`);
  process.exit(1);
}
const raw = readFileSync(scrollbackPath, "utf8");

let agent = null;
const manifestPath = join(runDir, "spawn.json");
if (existsSync(manifestPath)) {
  try {
    agent = JSON.parse(readFileSync(manifestPath, "utf8")).agent;
  } catch {
    /* manifest optional */
  }
}

const nudgeLogPath =
  opts.nudgeLog || process.env.SKYLINE_NUDGE_FIRELOG || join(tmpdir(), "skyline-nudge-fires.jsonl");
const nudgeLogText = existsSync(nudgeLogPath) ? readFileSync(nudgeLogPath, "utf8") : "";

const report = classify(raw, {
  agent,
  sessionId: opts.sessionId || null,
  nudgeLogText,
});
report.scrollback_source = scrollbackPath;
report.nudge_log_source = existsSync(nudgeLogPath) ? nudgeLogPath : "(absent)";

const jsonPath = join(runDir, "report.json");
const mdPath = join(runDir, "report.md");
writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n");
writeFileSync(mdPath, toMarkdown(report));

console.log(`report.json: ${jsonPath}`);
console.log(`report.md:   ${mdPath}`);
console.log("");
console.log(`semantic_used_session=${report.semantic_used_session}  ` +
  `grep_before_first_semantic=${report.grep_count_before_first_semantic}  ` +
  `t2=${report.t2_caller_parity.class}  ` +
  `t5_pass=${report.t5_nudge_crosscheck.pass}  ` +
  `gate_b_pass=${report.gate_b.pass}`);
