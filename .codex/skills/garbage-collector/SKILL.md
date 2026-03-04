---
name: garbage-collector
description: >
  Reduces repo entropy (dead code, TODOs, inconsistent patterns) without changing product behavior.
  Use when repo starts accumulating drift, duplicated helpers, messy docs, or repeated lint/test failures.
  Do: open small, reviewable cleanup commits; keep behavior stable; improve harness scripts if needed.
  Don't use during feature implementation unless cleanup is necessary to unblock.
  Outputs: smaller diffs that reduce future agent confusion and improve determinism.
---

## Goal
Make the repo easier for agents (and humans) to operate reliably:
- fewer ambiguous patterns
- fewer duplicates
- cleaner scripts + docs
- more deterministic tests

## Quick scan
```bash
bash .codex/skills/garbage-collector/scripts/gc.sh
```

## Rules
- Keep diffs small and reviewable.
- No semantic changes unless explicitly required.
- Prefer deleting dead code over "commenting it out".
- If you find a recurring confusion point, encode a rule in docs/ or scripts/agent/.

## Typical cleanup targets
- TODO/FIXME clusters
- duplicate utility functions
- inconsistent naming
- flaky tests (make them deterministic or mark/quarantine with justification)
