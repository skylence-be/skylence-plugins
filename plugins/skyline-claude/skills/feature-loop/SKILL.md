---
name: feature-loop
description: The skyline-native build loop for implementing a feature or a whole app in a repo — orientation ritual, route-aware semantic posture, vertical slices that each end green, anchor-based editing, batched diagnostics, test-anchored fixes, commit checkpoints, and advisor cadence. Invoke at the START of any implementation task ("build X", "create an app", "add feature Y") in a workspace where the skyline MCP tools are available. Includes a Laravel/Livewire profile.
---

# feature-loop: build features the skyline way

You are about to implement something. Do not improvise a workflow: this loop
exists because each rule below was measured or field-derived (skyline guide +
2026-07-26 haiku benches). The unit of work is a VERTICAL SLICE that ends
green; the unit of editing is an ANCHOR, never a re-read.

## Phase 0 — orient (five calls, once)

1. `tree` on the ABSOLUTE repo root (the daemon does not share your cwd —
   pass absolute paths or `cwd=` on every skyline call, always).
2. `git status` — working-tree truth; its lines carry edit anchors.
3. `lore_recall` — task words + stack words, UNSCOPED. Consume hits instead
   of re-deriving decisions.
4. `lsp_warm` once on a source file of the language you will edit. Read
   `project_layer_state` and set your semantic posture (next section).
5. Read the dependency manifest (composer.json / package.json / Cargo.toml)
   before assuming a library is or is not installed.

## Semantic posture — decided by warm, not by hope

| `project_layer_state` | Posture |
|---|---|
| `fresh` (ready_semantic true) | Full semantic surface: `definition`, `references`, `symbol_card`/`impact` (PHP mcp route). Trust diagnostics. |
| `unprobed_lsp_route` | LSP route serves this box. `diagnostics` works; `definition` resolves same-file only; `references` is unreliable; `symbol_card`/`impact`/`unreferenced` will refuse. Cross-file questions: `grep` + tests are the truth. Treat stdlib "Undefined function" errors as possibly stale. |
| `mcp_resolve_failed` / `mcp_call_failed` | Same as above (routing self-healed); a daemon restart retries the mcp route — do not chase it mid-task. |
| `stale` / `reindexing` / `unverified` | Structural nav fine; re-warm per the hint before trusting semantics. |

"class X is not covered by any mounted dependency index" info-notes on a
local-`vendor/` repo are EXPECTED, not errors.

## The slice loop

Plan the feature as 3–8 vertical slices, each independently shippable
(data model → first UI surface → each behavior → polish). Then per slice:

1. **Generate or locate.** Scaffolding via `run` with an ARGV ARRAY
   (`["php","artisan","make:model","Todo","-mf"]`) — never a shell string;
   background anything slow (`background:true`, then `run_wait`).
2. **Edit from anchors.** `grep` (or `find`) → paste the `¶path#TAG` header
   straight into `edit`. Never read a file you already have an anchor for.
   Multiple hunks in one file = ONE edit call with stacked ops. A change
   spanning files (model + component + test) = ONE multi-section edit with
   `verify:true` — it applies atomically and rolls back whole on any reject.
3. **Check the slice.** ONE `diagnostics` call with `paths:[...]` for every
   touched source file — not one call per file.
4. **Prove the slice.** `test` (the tool): failures come back with edit
   anchors — fix directly from them, no re-locating. A template/view edit
   (`.blade.php`, `.vue`) is syntax-checked only by `verify:true`; pair it
   with a route-level render test (`assertOk`) in the same slice, because
   runtime component/asset resolution fails invisibly to any reparse.
5. **Checkpoint.** Format (`run` the formatter, e.g. `pint --dirty`), then
   `git_commit` the green slice. Small commits are your rollback points.

Escalate out of the loop only when a slice cannot go green: state what
failed with the exact test/diagnostic output, never push on with red.

## Advisor cadence

If an advisor/review tool is active in this session, consult it at SLICE
BOUNDARIES (after the model slice, after the first UI slice, before final)
and take its findings as review input. Do not consult it per-edit; it
bills tokens and reviews half-states badly.

## Laravel / Livewire profile

- Slice order for a CRUD app: migration + model + factory → Livewire
  component + blade + route → create/toggle/edit/delete behaviors (one
  slice each if non-trivial) → filters/scoping/validation → seeder + empty
  states + polish.
- Scaffold with artisan via `run` argv: `make:model X -mf`,
  `make:livewire XList`, `php artisan migrate` after each schema slice.
- Livewire: keep component state minimal; validate in the component
  (`rules()`); every component gets a feature test that mounts it and a
  route render test (`assertOk`).
- Auth scoping: every query through the owning user relationship — write
  the test that proves another user sees nothing in the same slice.
- `pint --dirty` before every commit; run the whole suite (`test`) before
  the final report.
