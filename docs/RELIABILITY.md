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

## Session Cadence
1. Reconstruct context from `.agent/progress.log`, `.agent/feature_list.json`, git history.
2. Run baseline smoke.
3. Do one task end-to-end.
4. Record evidence and handoff.

<!-- HARNESS-INFERRED:START -->
## Inferred Snapshot
- Files scanned: 0
- Has obvious test layout: False
- TODO/FIXME hotspots:
- No TODO/FIXME hotspots detected
<!-- HARNESS-INFERRED:END -->
