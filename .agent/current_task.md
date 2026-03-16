# Current Task
Task ID: story-quality-hardening-01

## Goal
Add a lightweight story-concept stage plus continuity-focused QA so generated 3-7 stories stop inventing caregiver terms, chores, deadlines, and Bitcoin framing ad hoc.

## Constraints
- Keep changes internal to prompts, schemas, deterministic validators, and worker orchestration; no public API/UI contract changes.
- Keep explicit Bitcoin wording late and limited to one adult line in the final two pages for this slice.
- Default caregiver wording to configurable `Mom` or `Dad` and keep the scope focused on 3-7 picture-book story generation.

## Plan (short)
1) Add `StoryConcept` and continuity-focused beat/story schema contracts plus prompt updates.
2) Wire worker orchestration for concept generation, story QA artifacts, and bounded page-vs-beat rewrite routing.
3) Add regression/happy-path tests for counting, caregiver consistency, continuity, late setup, and Bitcoin fit.

## Evidence required
- `pnpm --filter @book/prompts test`
- `pnpm --filter @book/domain test`
- `pnpm --filter @book/workers test`
- `pnpm --filter @book/api test`
- `bash scripts/agent/quality.sh`

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS
- work: implemented on `codex/story-quality-hardening`
- verification:
  - `pnpm --filter @book/prompts test` PASS
  - `pnpm --filter @book/domain test` PASS
  - `pnpm --filter @book/workers test` PASS
  - `bash scripts/agent/quality.sh` PASS
