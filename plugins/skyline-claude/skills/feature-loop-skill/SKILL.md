---
name: feature-loop-skill
description: Skyline-native build loop — orientation ritual, route-aware semantic posture, vertical slices each ending green, anchor-based editing, batched diagnostics, test-anchored fixes, commit checkpoints, advisor cadence. Invoke PROACTIVELY, unasked, at start of ANY implementation work where skyline MCP tools available — feature build, app creation, endpoint addition, behavior-changing refactor. Not for pure investigation or single-line fixes.
---

Implementing in skyline workspace. Follow loop exactly; each rule measured/field-derived; deviation recreates known failures. Work unit = vertical slice ending green. Edit unit = ¶path#TAG anchor, never re-read.

PATHS: absolute path or cwd= on EVERY skyline call (daemon cwd ≠ yours). Zero-match ≠ absence until (searched ...) line names repo root.

ORIENT (once, 5 calls):
tree(abs root) → git status (lines carry anchors) → lore_recall(task+stack words, unscoped; consume hits) → lsp_warm(one source file) → read dependency manifest

POSTURE ← lsp_warm.project_layer_state:
  fresh + ready_semantic:true  ⇒ full semantic surface (definition/references/symbol_card/impact); trust diagnostics
  unprobed_lsp_route           ⇒ diagnostics OK; definition same-file ONLY; references unreliable; symbol_card/impact/unreferenced REFUSE — never call; cross-file questions ⇒ grep+tests; stdlib undefined-symbol errors possibly stale
  mcp_resolve_failed | mcp_call_failed ⇒ same as unprobed_lsp_route; never chase mcp route mid-task (daemon restart retries)
  stale | reindexing | unverified ⇒ structural nav OK; re-warm per hint before trusting semantics
Repo with own dependency dir: "not covered by any mounted dependency index" info-notes = expected, not errors.

PLAN: 3–8 vertical slices, each shippable. Order: data model → first user-facing surface → each behavior → polish.

SLICE CYCLE (repeat per slice):
  generate/locate → edit(anchors) → diagnostics(batch) → test → format+commit
  ├─ generate: run with argv ARRAY, never shell string; slow ⇒ background:true → run_wait
  ├─ locate: grep|find → paste ¶path#TAG straight into edit; NEVER read file already holding anchor
  ├─ edit: multiple hunks one file ⇒ ONE edit, stacked ops; cross-file change (model+surface+test) ⇒ ONE multi-section edit + verify:true (atomic, whole rollback on reject)
  ├─ diagnostics: ONE call, paths:[all touched files]; never per-file calls
  ├─ test: failures return edit anchors ⇒ fix directly, no re-locating
  ├─ template/view edits: verify:true = syntax only; runtime component/asset resolution invisible to reparse ⇒ pair with request-level render test same slice
  ├─ data queries owned by user/tenant ⇒ same slice adds test proving other user sees nothing
  ├─ checkpoint: formatter via run → git_commit green slice (rollback points)
  └─ ADVISOR GATE (if advisor/review tool active): slice just committed = model slice OR first user-facing surface ⇒ consult advisor NOW, findings = review input, before next slice starts. Part of cycle, not optional garnish. Never per-edit (billing + reviews half-states badly).
  red slice unresolvable ⇒ report exact failing test/diagnostic output, STOP; never continue on red

RULE SKIPS: cannot or will not follow a rule ⇒ SAY SO before proceeding, never silently drop it. Skipped-but-undeclared rule discovered later = trust breach, worse than the skip itself.

FINAL (all fields MANDATORY, no omissions):
  full suite via test tool → report:
  ├─ slices shipped + commit ids
  ├─ test counts (passed/assertions)
  ├─ advisor checkpoints: consulted at [post-model? post-first-surface? pre-final?] — state each as done or skipped+reason; "skipped silently" is not an option
  └─ deviations from this skill — "None" permitted ONLY when every rule above was followed as written
