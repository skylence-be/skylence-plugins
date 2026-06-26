---
description: Report skyway daemon, budget, and recent-run status.
---

Run these and report the output verbatim (do not assume state):

```
skyway daemon status
skyway budget
skyway logs
```

- If `skyway daemon status` shows not running: say so; offer `skyway serve` (the MCP `skylence_*` tools are dead until it is up).
- Surface budget; if near the monthly cap, flag it before any new runs.
- For any non-success recent run, offer to debug it with the skyway-operate skill (`skylence_get_run` → `skylence_get_run_step_messages`).
