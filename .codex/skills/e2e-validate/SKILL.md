---
name: e2e-validate
description: >
  Runs end-to-end validation and captures artifacts.
  Use when a change impacts user workflows, UI, routing, auth, or integrations.
  Do: run scripts/agent/e2e.sh, store relevant artifacts, and record evidence.
  Don't use when change is purely internal and covered by unit tests.
  Outputs: e2e PASS/FAIL plus artifact pointers and evidence string.
---

## Run e2e
```bash
bash scripts/agent/e2e.sh
```

## Capture evidence
If artifacts exist (e.g. playwright-report/ or test-results/), copy or reference them.
Preferred location for saved artifacts:
- `.agent/artifacts/`

## Record evidence (example)
- `bash scripts/agent/e2e.sh => PASS (playwright-report/ generated)`
