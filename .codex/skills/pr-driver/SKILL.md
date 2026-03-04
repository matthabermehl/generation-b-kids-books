---
name: pr-driver
description: >
  Prepares a clean PR for a completed task.
  Use when a task is passing with evidence and you want a reviewable change set.
  Do: ensure quality gates pass, produce crisp PR description, include test plan + risks.
  Don't use when the task is incomplete or baseline is failing.
  Outputs: branch + commits + PR body text (template filled).
---

## Before you start
- Ensure the task is passing and evidenced in `.agent/feature_list.json`
- Ensure `bash scripts/agent/quality.sh` passes

## Suggested flow
```bash
git status
bash scripts/agent/quality.sh
git diff --stat
```

## PR description template
Use `.codex/skills/pr-driver/templates/pr.md` as your starting point.
Fill in:
- what changed (1-5 bullets)
- why
- evidence (exact commands + PASS)
- risks + mitigations
- rollback plan (if applicable)
