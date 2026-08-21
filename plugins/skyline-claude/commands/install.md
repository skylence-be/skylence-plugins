---
description: Register Skyline daemon as an autostart service.
---

Run the skyline daemon install command to register the daemon as an autostart service on port 7333 and verify it is active:

```
run(["sh", "-c", "skyline daemon install && skyline daemon status"])
```

After the command completes, report the daemon installation and status output to the user. The command is idempotent and safe to run repeatedly.
