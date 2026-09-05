---
name: atlas-verify
description: Run the VYUHA ATLAS gate and report the end-of-session checklist as observed numbers — verify exit code, vitest counts vs VYUHA-ATLAS-STATE.md, clean tree, no DB or key material tracked in git. Use before committing ATLAS or signing off a phase.
user-invocable: true
context: fork
agent: atlas-verifier
---

# /atlas-verify

Run the ATLAS gate once and report what was observed.

Do exactly this:

1. Cheap checks first — `git status --short`,
   `git ls-files | grep -Ei "\.sqlite(-wal|-shm)?$|\.key$|\.pem$|^data/"` (no output is the pass),
   branch and ahead/behind vs `origin/main`.
2. Read the claimed test counts and newest DONE phase out of `VYUHA-ATLAS-STATE.md`.
3. `npm run verify > verify.log 2>&1; echo EXIT=$?` — exactly once.
4. Compare observed vitest counts to the STATE claim and report every line of the `AGENTS.md`
   end-of-session discipline as an observed result.

Do not commit, push, edit any file, or run `npm install`. End with the exit code, the test count,
and an explicit MAY END / MUST NOT END verdict — never the word "passed" on its own.
