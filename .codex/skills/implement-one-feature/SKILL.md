---
name: implement-one-feature
description: >
  Implements exactly one task from .agent/feature_list.json end-to-end.
  Use when a single TASK_ID is selected and baseline smoke is passing.
  Do: implement minimal change -> add/adjust tests -> verify -> mark task passing with evidence -> update progress log -> commit.
  Don't use when: baseline is failing, requirements are unclear, or you need to redesign multiple areas at once.
  Outputs: passing task with evidence, clean quality gates, commit + progress entry.
---

## Guardrails
- One task id per session.
- Do not rewrite the task description/spec. Only update:
  - `passes`
  - `evidence`
- If you discover missing requirements, add a *new* task rather than mutating existing ones.

## Workflow
1) Confirm baseline is green:
```bash
bash scripts/agent/smoke.sh
```

2) Inspect task details:
```bash
scripts/agent/feature_list.py show <TASK_ID>
```

3) Make a minimal plan in `.agent/current_task.md`:
- expected user-visible change
- files you expect to touch
- tests/e2e you will run

4) Implement + test in tight loops:
```bash
# edit code
bash scripts/agent/test.sh
```

5) Run quality gates:
```bash
bash scripts/agent/quality.sh
```

6) If task needs UI validation or flows:
```bash
bash scripts/agent/e2e.sh
```

## Mark task passing (only after evidence)
Prefer to include explicit commands + a short result summary.

```bash
scripts/agent/feature_list.py pass <TASK_ID> --evidence "bash scripts/agent/quality.sh (PASS); bash scripts/agent/e2e.sh (PASS)"
```

## Update progress log (append-only)
Append a block to `.agent/progress.log`:
- timestamp (local)
- task id
- what changed
- commands run + PASS/FAIL
- next task suggestion
- commit hash (after commit)

## Commit
```bash
git status
git diff --stat
git add -A
git commit -m "feat(<area>): <short description> [<TASK_ID>]"
```

## If you get stuck
Switch to **debug-triage** and generate a triage bundle before trying random changes.
