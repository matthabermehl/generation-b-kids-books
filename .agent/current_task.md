# Current Task
Task ID: scene-memory-01

## Goal
Extend beat/page planning with stable scene memory so the OpenAI page-art pipeline can reuse same-scene references without dragging the full story into each image prompt.

## Constraints
- Backward compatibility for Fal-era scene/image roles is intentionally out of scope.
- Scene continuity must come from the approved beat/story artifacts, not a separate ad hoc cache.
- The new scene plan should be explicit enough to drive `image-plan.json` generation and later review/debug work.

## Plan (short)
1) Extend beat/story types and planner outputs with `sceneId` plus compact scene visual descriptors.
2) Persist `scene-plan.json` and `image-plan.json` artifacts from the approved story package.
3) Add tests around scene deduplication and same-scene reference resolution, then hand the worker cutover a stable prompt/reference contract.

## Evidence required
- `pnpm --filter @book/workers test`
- `pnpm --filter @book/api test`
- `bash scripts/agent/smoke.sh`

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS on `codex/openai-image-pipeline`
- previous task: `character-approval-flow-01` completed with API/web/smoke/quality evidence on `codex/openai-image-pipeline`
- work: ready to start
