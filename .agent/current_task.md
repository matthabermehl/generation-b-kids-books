# Current Task
Task ID: bitcoin-forward-validator-alignment-01

## Goal
Align deterministic beat and story validation to the shared Bitcoin-forward policy seam so salience, timing, safety, and ending checks agree while the child's money problem stays primary.

## Constraints
- Keep the repo on `codex/bitcoin-forward-modes`.
- Do not add a parent-facing selector, API request field, `books` column, or per-book persisted mode in this pass unless hidden coupling forces it.
- Keep the existing 5 lesson keys and current reading profiles unchanged.
- Preserve current safety rules:
  - no hype or investment promises
  - no technical or device-first framing
  - no child decoding or explaining Bitcoin
- Use the existing shared Bitcoin-story policy seam instead of reintroducing scattered hard-coded validator thresholds or wording.
- Keep endings emotionally warm and non-lecture-like across all current lessons, and keep the child's concrete money problem primary.

## Plan (short)
1. Completed: route domain validators and prompt deterministic checks through policy-backed Bitcoin salience, timing, framing, and ending expectations.
2. Completed: add focused regressions for pre-ending distribution, caregiver or narrator framing, hype and technical bans, and warm-ending versus lecture-ending behavior.
3. Next: move to `bitcoin-forward-fixtures-docs-01`.

## Evidence required
- `pnpm --filter @book/domain test`
- `pnpm --filter @book/prompts test`
- `pnpm --filter @book/workers test`
- `bash scripts/agent/quality.sh`

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS
- work: completed 2026-03-30; validators now enforce policy-backed Bitcoin timing and framing, prompt-side deterministic checks share the same ending and safety logic, and focused regressions cover the new failure modes
- next: `bitcoin-forward-fixtures-docs-01`
