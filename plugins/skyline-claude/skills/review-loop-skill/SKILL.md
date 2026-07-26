---
name: review-loop-skill
description: Skyline-native code review loop — full diff never summary, every claim re-verified by execution, adversarial failure scenarios per finding, ranked findings with anchors, report without patching. Invoke PROACTIVELY, unasked, whenever work is reviewing changes — PR, branch diff, commit, "look at what X built". Not for fixing (debug-loop-skill) or building (feature-loop-skill).
---

Reviewing changes in skyline workspace. Review ARTIFACTS, never author intent. Report findings; do NOT fix unless explicitly asked.

PATHS: absolute path or cwd= on EVERY skyline call.

SCOPE:
  git diff (branch/refs) or git show (commit) → FULL diff, never summary/description — squash-merge ships EVERYTHING on branch; unrecognized commit or hunk ⇒ finding, review pauses until explained
  diff sections carry ¶path#TAG anchors → cite findings by them

VERIFY CLAIMS (claim = hypothesis until re-checked):
  "tests pass" ⇒ re-run via test tool, counts from output YOU saw
  "command outputs X" ⇒ re-run via run; exit_code first line authoritative; exit codes through pipes lie
  "N occurrences updated" ⇒ grep count yourself
  perf/size claims ⇒ measure or mark unverified

ADVERSARIAL READ (per changed surface):
  ├─ failure scenario hunt: concrete inputs/state ⇒ wrong output/crash; no concrete scenario ⇒ not a correctness finding
  ├─ new/changed strings + contracts ⇒ grep consumers; matched-elsewhere literals (error text, state values, config keys) drift silently
  ├─ tests assert what change claims? test asserting nothing new = coverage finding
  ├─ boundary + error paths: empty, zero-match, concurrent writer, first-contact, permission failure
  ├─ semantic tools per posture (lsp_warm project_layer_state, rules as feature-loop-skill); impact where offered for blast radius; posture forbids them ⇒ grep+tests
  └─ template/view changes without request-level render test ⇒ finding (reparse cannot see runtime resolution)

FINDINGS:
  ranked most-severe first; each = file:line anchor + one-sentence defect + concrete failure scenario
  severity: breaks-correctness > silent-drift > missing-coverage > efficiency > style (style only if asked)
  verified-nothing-found = valid result; state what was checked, never manufacture findings

REPORT: verdict (approve / bounce with findings) + verification evidence (commands re-run, counts seen) + findings list. Recurring defect class worth remembering ⇒ lore_mark(kind=fact).
