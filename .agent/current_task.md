# Current Task
Task ID: bitcoin-forward-deploy-smoke-01

## Goal
Prove the Bitcoin-forward alignment in deployed dev with fresh local gates, provider connectivity, two live picture-book smokes, and persisted smoke/PDF artifacts under `.agent/artifacts/bitcoin-forward-modes/`.

## Constraints
- Keep the repo on `codex/bitcoin-forward-modes`.
- Do not widen UI, API, DB, or migration contracts during this validation pass.
- Preserve the shipped single Bitcoin-forward posture with the current 5 lesson keys and current reading profiles.
- Preserve safety rules:
  - no hype or investment promises
  - no technical or device-first framing
  - no child decoding or explaining Bitcoin
- Keep endings emotionally warm rather than lecture-like.
- Use the existing shared Bitcoin-story policy seam; this task is deployment proof, not another wording refactor.

## Plan (short)
1. Reuse the fresh local gate evidence from this branch state and deploy dev with `pnpm cdk:deploy:dev`.
2. Run `pnpm ops:provider-smoke`, then run picture-book smoke for:
   - `READING_PROFILE_ID=read_aloud_3_4 MONEY_LESSON_KEY=better_rules`
   - `READING_PROFILE_ID=early_decoder_5_7 MONEY_LESSON_KEY=new_money_unfair`
3. Copy the two smoke JSON artifacts plus downloaded PDFs into `.agent/artifacts/bitcoin-forward-modes/`, then mark the task passing with exact evidence.

## Evidence required
- `bash scripts/agent/smoke.sh`
- `pnpm --filter @book/domain test`
- `pnpm --filter @book/prompts test`
- `pnpm --filter @book/workers test`
- `bash scripts/agent/quality.sh`
- `pnpm cdk:deploy:dev`
- `pnpm ops:provider-smoke`
- `API_BASE_URL=... READING_PROFILE_ID=read_aloud_3_4 MONEY_LESSON_KEY=better_rules pnpm ops:picture-book-smoke`
- `API_BASE_URL=... READING_PROFILE_ID=early_decoder_5_7 MONEY_LESSON_KEY=new_money_unfair pnpm ops:picture-book-smoke`

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS
- work: queued 2026-03-30 after `bitcoin-forward-fixtures-docs-01` passed with prompt/worker/quality evidence
- next: deploy dev, capture live smoke artifacts, and download both ready-book PDFs
