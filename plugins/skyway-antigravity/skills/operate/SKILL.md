---
name: skyway-operate
description: Operate skyway .sky workflows through the skyway MCP (skylence_* tools). Use to run, inspect, debug, cancel, resume, lint, or cost-estimate a workflow, or to check daemon and budget status. Daemon: http://127.0.0.1:3090.
---

skyway = workflow-orchestration daemon on 127.0.0.1:3090. MCP server `skyway`; all tools prefixed `skylence_*`. Start runs via CLI `skyway run <wf>` or a trigger (no MCP start tool). Inspect and control runs via the MCP.

PRECHECK: a failing `skylence_*` call usually means the daemon is down, not a missing run. Verify `skyway daemon status`; start with `skyway serve` (or `skyway service install`). Never substitute native tools for a down daemon — wait and retry.

DISCOVER
- skylence_list_workflows — available `.sky` workflows
- skylence_list_runs — recent runs; skylence_search_runs — filter by workflow/status
- skylence_list_jobs — queue; skylence_list_skills, skylence_list_learnings

BEFORE RUNNING
- skylence_lint_workflow (by name) / skylence_lint_workflow_text (inline source) — must be clean
- skylence_estimate_workflow_cost — predicted USD before spending
- start: CLI `skyway run <wf> [--var k=v]`; capture the run id

INSPECT (by run id)
- skylence_get_run — status + error + totals
- skylence_get_run_step_messages — per-node output (which node did what)
- skylence_get_run_events — ordered event timeline
- skylence_tail_run_output — live/last output
- skylence_get_run_messages — full transcript; skylence_search_run_messages — grep it
- skylence_get_run_audit — audit view; skylence_get_run_recording — replayable capture

DEBUG a failure
1. skylence_get_run -> status=failed + error class
2. skylence_get_run_step_messages -> the failing node + its output
3. skylence_search_run_messages -> locate the exact error text
4. fix the `.sky`, re-lint (skylence_lint_workflow), re-run

CONTROL
- stop: skylence_cancel_run
- resume: skylence_resume_run; paused on approval/wait: skylence_resume_paused_run
- queue: skylence_get_job, skylence_cancel_job, skylence_cancel_all_jobs

STATUS / BUDGET (every run spends real Claude $)
- skylence_whoami — identity/daemon reachable
- skylence_get_daily_stats — spend; CLI `skyway budget` — monthly cap
- near the cap: warn before launching more runs

RULES: report run state from tool output, never assume. Surface cost before large runs. Down daemon ⇒ wait + retry, not native fallback.
