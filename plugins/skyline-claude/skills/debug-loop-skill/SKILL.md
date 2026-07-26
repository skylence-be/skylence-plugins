---
name: debug-loop-skill
description: Skyline-native debug loop — recall known quirks before theorizing, red reproduction before any fix, one-hypothesis-one-probe discipline, teed-output forensics instead of reruns, regression test mandatory. Invoke PROACTIVELY, unasked, whenever work is fixing something broken — failing test, error, crash, wrong output, regression, "X stopped working". Not for building new behavior (feature-loop-skill) or reviewing diffs (review-loop-skill).
---

Fixing something broken in skyline workspace. Follow loop exactly. NEVER fix before red reproduction exists; NEVER stack second fix on unverified first theory.

PATHS: absolute path or cwd= on EVERY skyline call. Zero-match ≠ absence until (searched ...) line names repo root.

ORIENT:
lore_recall(symptom words + component, unscoped) FIRST — known quirk may BE answer → git status + git diff (recent change = prime suspect) → lsp_warm if semantic tools needed (posture per project_layer_state, same rules as feature-loop-skill)

REPRODUCE (before ANY fix):
  failing test exists ⇒ test tool → capture exact failure + anchor
  no failing test ⇒ write one reproducing symptom → confirm RED
  not test-reachable (daemon/CLI behavior) ⇒ capture failing command via run → exit_code + teed raw path = evidence
  cannot reproduce ⇒ STOP, report what was tried; never "fix" unreproduced symptom

ISOLATE:
  ├─ identify EXACT artifact running before theorizing about its behavior: which binary/version/path/route serves the failing call (field lesson: six hypotheses fell because nobody checked which binary executed)
  ├─ prior command output ⇒ run_query on teed raw path, NEVER re-run to re-see
  ├─ logs ⇒ devlog_tail (compressed), not raw tail through shell
  ├─ code ⇒ grep with anchors; diagnostics ONE call paths:[suspects]
  └─ external state change since last-known-good ⇒ read since_tag delta, not full re-read

HYPOTHESIS DISCIPLINE:
  one hypothesis ⇒ one CHEAPEST disproof probe ⇒ result
  falsified ⇒ note it (prevents re-testing), next hypothesis
  confirmed ⇒ minimal fix from anchors
  3+ falsified ⇒ back to ISOLATE, wrong layer

FIX:
  minimal edit via ¶path#TAG anchors (stacked ops, multi-file atomic + verify:true when spanning)
  regression test in SAME change — red before fix, green after; symptom without test coverage gets coverage now
  diagnostics(batch) → full suite via test tool → formatter via run → git_commit

REPORT: root cause (mechanism, not narrative) + falsified-hypothesis trail + fix location + regression test name + suite counts. Cause worth remembering machine-wide ⇒ lore_mark(kind=fact, why= names expected-instead).
