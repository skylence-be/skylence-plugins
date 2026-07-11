# Blind-probe discoverability harness (ACUITY-DISCOVER L5)

Repeatable experiment measuring whether a fresh, unprimed Solo agent reaches for
the acuity-backed **semantic** navigation tools (`skyline_symbol_card`,
`skyline_references`, `skyline_definition`, ...) or falls back to text `skyline_grep`
when handed symbol questions with no mention of the LSP.

Fixed by design pad 226 §2-L5 + §3 and issue skylence-plugins#16. This harness
**implements** that protocol; it does not redesign it. Baseline is probe-A
(todo 1260): claude/opus, zero semantic adoption, grep habit won.

## Files

| file | role |
| --- | --- |
| `prompt.mjs` | the FROZEN 5-task prompt (`PROMPT_VERSION`) |
| `spawn-probe.mjs` | prep a run: mint run dir + `prompt.txt` + `spawn.json` manifest |
| `collect-classify.mjs` | read captured scrollback + nudge log, write `report.json` + `report.md` |
| `classify.mjs` | pure classifier core (parsing + metrics) |
| `classify.test.mjs` | `node --test` fixture test (reproduces the probe-A verdict) |
| `fixtures/probe-a-1614.txt` | archived probe-A scrollback (proc 1614) |

## The 5 fixed tasks

- **T1** php-symbol: `User` model shape / extends (1260 original).
- **T2** php-symbol: usages / blast-radius, caller count (1260 original).
- **T3** php-symbol: multi-`User` disambiguation / resolution (1260 original).
- **T4** rust/go-symbol: `CompressStats` type on binary-skyline (generalization control).
- **T5** text: literal `SKYLINE_DATA_DIR` config-key hunt (false-positive control).

The agent gets all five at once, unprimed, in the default Solo project cwd (as
probe-A did); tasks address repos by absolute path. aureuserp and binary-skyline
carry pre-existing acuity packs.

## Metrics (per pad §2-L5 / §3)

- `semantic_used_session`: any semantic nav tool used at all (GATE-B input).
- `grep_count_before_first_semantic`: distinct `skyline_grep` calls before the
  first semantic call (grep-habit depth).
- `t2_caller_parity`: `semantic-404` (true caller count from `symbol_card`) vs
  `text-633` (raw grep over-count) vs `mixed` / `unknown`.
- `t5_nudge_crosscheck`: the PHP nudge (pad §2-L1) must NOT fire on the pure
  text hunt; cross-checked against the fire-log JSONL
  (`$SKYLINE_NUDGE_FIRELOG` or `${os.tmpdir()}/skyline-nudge-fires.jsonl`).
- `gate_b.pass`: semantic on >=2/3 PHP tasks incl. T3, T4 semantic, T5 zero php nudge.

## Run procedure

Prep (pure, repeatable, one command):

```
node scripts/discover-probe/spawn-probe.mjs <claude-opus|grok>
```

The live spawn/collect are **orchestrator** actions (GATE-B), since Solo's
`spawn_agent` / `get_process_raw_output` are MCP-only surfaces (no `solo` CLI, no
on-disk scrollback log). `spawn.json` prints the exact steps: resolve
`agent_tool_id` via `list_agent_tools`, `spawn_agent`, `send_input(prompt.txt)`,
and on idle dump `get_process_raw_output(process_id, 200)` into
`<run>/scrollback.txt`, then:

```
node scripts/discover-probe/collect-classify.mjs <run-dir>
```

Close the probe process afterward; leave no orphan agents.

## Known constraints (honest scope)

- **Redraw noise.** Solo raw scrollback is an alternate-screen capture; lines are
  redrawn and duplicated. The classifier keys on the clean
  `plugin:skyline-claude:skyline - <tool> (MCP)(<args>)` marker and dedups by full
  call signature. Exact repeat *counts* of an identical call are not recoverable
  (a real second call is indistinguishable from a redraw), so distinct-call counts
  are the unit and `semantic_used` (set membership) is the authoritative signal.
- **Per-task attribution.** Tasks are answered in one interleaved batch, so tool
  calls cannot be cleanly attributed to a single task from scrollback. Symbol-task
  semantic adoption is therefore reported at session level (best-effort). For a
  zero-adoption run (probe-A) every per-task flag is trivially false, which is the
  common case the GATE-B bar turns on.
- **200-line cap.** `get_process_raw_output` returns at most 200 lines. For a long
  run, dump on idle and, if needed, stitch multiple dumps into `scrollback.txt`
  before classifying.

## Freezing

Changing `PROMPT` invalidates cross-run comparability. Any edit must bump
`PROMPT_VERSION` in `prompt.mjs` and be noted here.
