#!/usr/bin/env node
// spawn-probe.mjs <claude-opus|grok> [--out DIR]
//
// Deterministic, repeatable prep for one blind PHP-LSP discoverability probe run
// (ACUITY-DISCOVER L5 / plugins#16). Pure node stdlib: no network, no MCP.
//
// Why prep-only: Solo's spawn_agent / get_process_raw_output are MCP surfaces
// reachable only from an agent session (there is no `solo` CLI and no on-disk
// scrollback log). Firing a LIVE probe is an orchestrator action (GATE-B). This
// script mints the run directory and freezes the exact spawn inputs so every run
// is byte-identical; the orchestrator then executes the single MCP spawn printed
// at the end, drives it with send_input(PROMPT), and on idle dumps
// get_process_raw_output into <run>/scrollback.txt for collect-classify.mjs.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROMPT, PROMPT_VERSION } from "./prompt.mjs";

const AGENTS = {
  "claude-opus": { label: "claude-opus", model_hint: "Opus (low effort), matches todo 1260 probe-A" },
  grok: { label: "grok", model_hint: "grok, generalization arm of the matrix" },
};

function parseArgs(argv) {
  const rest = argv.slice(2);
  const agent = rest[0];
  let out = null;
  for (let i = 1; i < rest.length; i++) {
    if (rest[i] === "--out") out = rest[++i];
  }
  return { agent, out };
}

const { agent, out } = parseArgs(process.argv);
if (!agent || !AGENTS[agent]) {
  console.error("usage: spawn-probe.mjs <claude-opus|grok> [--out DIR]");
  console.error("  fixed 5-task blind probe; prep only, orchestrator fires the live spawn.");
  process.exit(2);
}

const now = new Date();
const utcDate = now.toISOString().slice(0, 10);
const ts = now.toISOString().replace(/[:.]/g, "-");
const runDir = out || join("evidence", "discover-probe", utcDate, `${agent}-${ts}`);
mkdirSync(runDir, { recursive: true });

const name = `discover-probe-${agent}-${ts}`;
const manifest = {
  prompt_version: PROMPT_VERSION,
  agent,
  agent_label: AGENTS[agent].label,
  model_hint: AGENTS[agent].model_hint,
  process_name: name,
  created_at: now.toISOString(),
  // The probe agent runs UNPRIMED, in the default Solo project cwd (binary-skyline,
  // exactly as probe-A did); tasks address repos by absolute path in the prompt.
  spawn: {
    tool: "spawn_agent",
    resolve_agent_tool_id_via: "list_agent_tools (pick the row for this agent_label)",
    args: { agent_tool_id: "<resolve from list_agent_tools>", name },
  },
  drive: { tool: "send_input", note: "send PROMPT verbatim from prompt.txt in ONE input" },
  collect: {
    on_idle: "get_process_raw_output(process_id, lines: 200)",
    write_to: join(runDir, "scrollback.txt"),
    then: `node scripts/discover-probe/collect-classify.mjs ${runDir}`,
  },
  teardown: "close_process(process_id) after collection; leave NO orphan agents.",
};

writeFileSync(join(runDir, "prompt.txt"), PROMPT + "\n");
writeFileSync(join(runDir, "spawn.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log(`run dir:   ${runDir}`);
console.log(`prompt:    ${join(runDir, "prompt.txt")} (v${PROMPT_VERSION})`);
console.log(`manifest:  ${join(runDir, "spawn.json")}`);
console.log("");
console.log("ORCHESTRATOR (GATE-B live spawn):");
console.log(`  1. list_agent_tools -> agent_tool_id for "${AGENTS[agent].label}"`);
console.log(`  2. spawn_agent(agent_tool_id, name: "${name}")`);
console.log(`  3. send_input(process_id, <contents of prompt.txt>)`);
console.log(`  4. on idle: get_process_raw_output(process_id, 200) > ${join(runDir, "scrollback.txt")}`);
console.log(`  5. node scripts/discover-probe/collect-classify.mjs ${runDir}`);
console.log(`  6. close_process(process_id)   # no orphans`);
