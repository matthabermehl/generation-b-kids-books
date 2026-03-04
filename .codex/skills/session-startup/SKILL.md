---
name: session-startup
description: >
  Starts a Codex work session safely for long-running autonomous projects.
  Use when beginning a fresh run (new chat/thread), after pulling new changes, or after a long compaction.
  Do: orient -> verify baseline via scripts/agent/smoke.sh -> select 1 next failing task -> write .agent/current_task.md.
  Don't use when you're already mid-task in the same run and have current state in mind.
  Outputs: baseline status, selected task id, updated current_task.md, immediate next commands.
---

## Goals
- Reconstruct state *fast* from repo artifacts (not memory)
- Ensure the baseline is green before changing anything
- Choose exactly one next task and create a compact "desk view" in `.agent/current_task.md`

## Commands (copy/paste)
```bash
set -e

pwd
git status --porcelain=v1 || true
git log --oneline -20 || true

# Read latest progress
tail -n 80 .agent/progress.log 2>/dev/null || true

# List next failing tasks
scripts/agent/feature_list.py list --limit 15 2>/dev/null || true

# Baseline smoke (must pass before new work)
bash scripts/agent/smoke.sh
```

## Choose the next task
Pick the highest-priority task with `"passes": false`.

To inspect details:
```bash
scripts/agent/feature_list.py show <TASK_ID>
```

## Write the current desk view
Create/update `.agent/current_task.md` (keep it short; no essays).
Template:
```md
# Current Task
Task ID: <TASK_ID>

## Goal
(one sentence)

## Constraints
- (non-negotiables)
- (security/reliability constraints)

## Plan (short)
1)
2)
3)

## Evidence required
- exact command(s) + expected output

## Status
- baseline: smoke PASS/FAIL
- work: not started / in progress / blocked
```

## If smoke fails
Stop and switch to **debug-triage**. Fix baseline first.
