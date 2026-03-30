# Reliability

## Escalation Rules
Escalate to human review when:
- requirements conflict or remain ambiguous after reading docs
- security-sensitive boundaries are touched
- repeated failures occur without new evidence
- required credentials/access are unavailable

## Definition of Done
- Selected task has evidence and correct pass state in `.agent/feature_list.json`
- `bash scripts/agent/quality.sh` has been run (or equivalent documented exception)
- `.agent/progress.log` updated with timestamped session block
- Commit created with scoped description
- If a task changes a live integration flow, attempt the repo smoke scripts and record any environment drift or deploy blockers explicitly

## Session Cadence
1. Reconstruct context from `.agent/progress.log`, `.agent/feature_list.json`, git history.
2. Run baseline smoke.
3. Do one task end-to-end.
4. Record evidence and handoff.

<!-- HARNESS-INFERRED:START -->
## Inferred Snapshot
- Runtime, README seed, and WIP context are refreshed in `.agent/handoff.md`.
- TODO/FIXME debt inventory is refreshed in `docs/exec-plans/tech-debt-tracker.md`.
- Execution evidence belongs in `.agent/progress.log`.
<!-- HARNESS-INFERRED:END -->
