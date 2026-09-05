---
name: atlas-status
description: Report VYUHA ATLAS health — newest encrypted backup and its age, whether that backup actually verified, encryption provider, git dirt and branch drift. Use at the start of an ATLAS session or whenever you want to know the real financial data is safely snapshotted.
user-invocable: true
context: fork
agent: atlas-monitor
---

# /atlas-status

Report ATLAS health in one read-only pass.

Do exactly this:

1. Newest `data/backups/atlas-*.sqlite` — filename, mtime, age in hours, and how many snapshots
   exist. Names and sizes only; never open one.
2. `netstat -ano | findstr :3100`. If something is LISTENING, `curl -s
   http://127.0.0.1:3100/api/backup` and report `encryption.provider` plus the newest entry's
   `verify` fields. If nothing is listening, report the verify state as UNKNOWN and say why —
   do NOT start the app.
3. If the newest backup is older than 24 h, state the `lib/db/index.ts:44` caveat: the auto-backup
   discards its verify result, so age alone cannot tell you whether a snapshot is sound.
4. `git status --short` count, branch, and ahead/behind vs `origin/main`.

Read-only throughout: no writes, no app start/stop, no commit, no `npm install`. Report ages in
hours from an mtime you actually read.
