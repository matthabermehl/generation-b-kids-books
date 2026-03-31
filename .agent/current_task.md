# Current Task
Task ID: bitcoin-forward-prompt-alignment-01

## Goal
Retune the shipped story prompts so the current single Bitcoin-forward posture reads clearly earlier and more often in caregiver or narrator framing while the child's money problem stays primary.

## Constraints
- Keep the repo on `codex/bitcoin-forward-modes`.
- Do not add a parent-facing selector, API request field, `books` column, or per-book persisted mode in this pass unless hidden coupling forces it.
- Keep the existing 5 lesson keys and current reading profiles unchanged.
- Preserve current safety rules:
  - no hype or investment promises
  - no technical or device-first framing
  - no child decoding or explaining Bitcoin
- Use the existing shared Bitcoin-story policy seam instead of reintroducing scattered hard-coded prompt wording.
- Keep endings emotionally warm and non-lecture-like across all current lessons.

## Plan (short)
1. Audit prompt builders for any remaining gentle-secondary wording or missing Bitcoin-forward guidance.
2. Tighten story concept, beat critic/rewrite, writer, and final critic wording around earlier recurring caregiver or narrator Bitcoin framing.
3. Add focused prompt regressions for concept, critic, and rewrite behavior before moving to validator alignment.

## Evidence required
- `pnpm --filter @book/domain test`
- `pnpm --filter @book/prompts test`
- `pnpm --filter @book/workers test`
- `bash scripts/agent/quality.sh`

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS
- work: completed 2026-03-30; story concept, beat critics, rewrite guidance, and prompt principles now align to the Bitcoin-forward seam without reintroducing lecture-like endings
- next: `bitcoin-forward-validator-alignment-01`
