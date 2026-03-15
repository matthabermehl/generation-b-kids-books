# Current Task
Task ID: character-approval-flow-01

## Goal
Add the pre-checkout character description, generation loop, and character selection flow so checkout is blocked until a parent approves a character reference.

## Constraints
- Character description is book-scoped and submitted on order creation.
- Character generation is capped at 10 candidates per book.
- No compatibility path for Fal-era roles or endpoints.
- Existing parent session/order/book persistence should keep working as the flow gains character state.

## Plan (short)
1) Extend the schema, API, and DB state for `characterDescription`, character candidate generation, and selection.
2) Update the parent flow and routed UI to generate/select character candidates before checkout.
3) Add tests for the 10-attempt cap, selection persistence, and checkout gating, then move to the next image-pipeline task.

## Evidence required
- `pnpm --filter @book/api test`
- `pnpm --filter @book/web test`
- `bash scripts/agent/smoke.sh`

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS on `codex/openai-image-pipeline`
- work: in progress
