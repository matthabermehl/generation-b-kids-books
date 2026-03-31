# Current Task
Task ID: bitcoin-story-modes-policy-prompt-01

## Goal
Generalize the Bitcoin story policy seam and prompt templates so `sound_money_implicit`, `bitcoin_reveal_8020`, and `bitcoin_forward` each have clear deterministic prompt targets without drifting from the persisted mode contract.

## Constraints
- Keep the current 5 lesson keys and current reading profiles.
- Add a parent-visible selector rather than hidden config.
- Persist the selected mode per book so retries and rebuilds stay deterministic.
- Preserve safety rules:
  - no hype or investment promises
  - no technical or device-first framing
  - no child decoding or explaining Bitcoin
- Preserve the existing shipped `bitcoin_forward` behavior as the default/backfill mode for historical books.
- Keep the child's concrete money problem primary in every mode.

## Plan (short)
1. Finish aligning `packages/domain/src/bitcoin-story-policy.ts` to describe all three modes from one shared seam.
2. Update prompt templates and prompt-principle coverage so story concept, beat planner, rewrite, writer, and critic prompts obey the selected `storyMode`.
3. Verify with domain/prompts/workers tests before moving to the dedicated validator-alignment task.

## Evidence required
- `bash scripts/agent/smoke.sh`
- `pnpm --filter @book/domain test`
- `pnpm --filter @book/prompts test`
- `pnpm --filter @book/workers test`
- `bash scripts/agent/quality.sh`

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS after the contract/persistence slice on `codex/bitcoin-story-modes`
- previous: `bitcoin-story-modes-contract-persistence-01` complete with persisted `storyMode` threaded through domain/API/web/workers
- work: in progress
- next: finish mode-aware story policy and prompt-template semantics without widening the newly landed contracts
