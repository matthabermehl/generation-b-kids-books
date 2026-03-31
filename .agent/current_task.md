# Current Task
Task ID: bitcoin-story-modes-contract-persistence-01

## Goal
Make `storyMode` a first-class, persisted book setting across domain types, parent flow, API/OpenAPI, and worker context so the three-mode dial is real instead of prompt-only.

## Constraints
- Keep the current 5 lesson keys and current reading profiles.
- Add a parent-visible selector rather than hidden config.
- Persist the selected mode per book so retries and rebuilds stay deterministic.
- Preserve safety rules:
  - no hype or investment promises
  - no technical or device-first framing
  - no child decoding or explaining Bitcoin
- Preserve the existing shipped `bitcoin_forward` behavior as the default/backfill mode for historical books.

## Plan (short)
1. Add a shared `StoryMode` enum plus domain/API request-response surfaces and persisted `books` storage.
2. Thread `storyMode` through create-order, book/order payloads, generated web types, parent-flow state, and worker load context.
3. Verify the new contract with targeted domain/api/web/workers tests, then move to policy and validator alignment tasks.

## Evidence required
- `bash scripts/agent/smoke.sh`
- `pnpm --filter @book/domain test`
- `pnpm --filter @book/api test`
- `pnpm --filter @book/web test`
- `pnpm --filter @book/workers test`
- `bash scripts/agent/quality.sh`

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS on `master` before branching and on `codex/bitcoin-story-modes` during harness reset
- work: in progress
- next: thread the new persisted `storyMode` contract through the create flow, OpenAPI, and worker load path
