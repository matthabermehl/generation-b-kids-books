# Current Task
Task ID: visual-identity-anchors-01

## Goal
Lock visible identity anchors for recurring humans and move supporting-character reference generation to an eager pre-page-art phase so later prompts and QA consume stable continuity inputs.

## Constraints
- Preserve the just-landed prompt hardening from `visual-continuity-style-prompts-01`.
- Keep `visual-bible.json` as the continuity source of truth and avoid breaking the approved `character_reference` flow.
- Generate eager references only for recurring supporting humans that are stable enough to review deterministically.

## Plan (short)
1. Extend the visual-continuity domain types and visual-bible builder with explicit locked identity-anchor fields for recurring supporting humans.
2. Update the worker continuity/pipeline flow so recurring supporting-character references are generated eagerly once the visual bible is available and persisted for downstream page jobs.
3. Cover the new lifecycle with targeted domain/worker tests, then rerun `pnpm --filter @book/domain test`, `pnpm --filter @book/workers test`, and `bash scripts/agent/quality.sh`.

## Evidence required
- `pnpm --filter @book/domain test`
- `pnpm --filter @book/workers test`
- `pnpm --filter @book/api test`
- `bash scripts/agent/quality.sh`

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS (2026-03-22)
- previous: `visual-continuity-style-prompts-01` PASS with prompt and pipeline verification (2026-03-22)
- work: implementation not started
