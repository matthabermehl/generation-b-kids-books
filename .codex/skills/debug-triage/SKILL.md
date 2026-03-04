---
name: debug-triage
description: >
  Diagnose failing tests/builds safely and produce a crisp triage report.
  Use when smoke/tests fail, behavior is unexpected, or the agent is looping without progress.
  Do: capture reproducible command, logs, environment snapshot, and a minimal root-cause hypothesis.
  Don't use when you already have a clear failing diff and fix.
  Outputs: triage bundle under .agent/triage/<timestamp>/ and a short triage_report.md.
---

## Goal
Produce *evidence* that makes debugging mechanical:
- exact failing command
- exact output
- repo state (diff/stat)
- env snapshot (versions)
- minimal hypothesis + next experiments

## Quick start
Run triage script with the failing command:
```bash
bash .codex/skills/debug-triage/scripts/triage.sh "bash scripts/agent/test.sh"
```

It writes a bundle to `.agent/triage/<timestamp>/`.

## What to do next
1) Open the generated `triage_report.md`
2) Identify the smallest fix that makes the failing command pass
3) Re-run the failing command *before* doing anything else

## If the issue is non-deterministic
- Run the failing command 3 times and record variance
- Capture seeds/timeouts
- Add a minimal stabilization (timeouts, retries) only if justified
