# Current Task
Task ID: openai-image-provider-01

## Goal
Replace the Fal/Kontext/Fill image worker path with a provider-neutral OpenAI image pipeline that uses approved character references plus same-scene continuity inputs to produce `page_art`.

## Constraints
- Backward compatibility for Fal-era image roles/config is intentionally out of scope.
- Full-book generation must become deterministic by running page jobs in `page_index` order.
- The worker may use only the approved `character_reference` plus up to two earlier current `page_art` images from the same `sceneId`.

## Plan (short)
1) Remove Fal-specific runtime config, DB field names, and orchestration steps in favor of provider-neutral OpenAI image generation/edit flows.
2) Replace `scene_plate` plus `page_fill` with single-pass `page_art` jobs that persist provenance and same-scene references from `image-plan.json`.
3) Add sequential page orchestration and single-page status polling so full-book runs and retry/resume share one deterministic path.

## Evidence required
- `pnpm --filter @book/workers test`
- `pnpm --filter @book/api test`
- `bash scripts/agent/quality.sh`

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS on `codex/scene-memory-openai`
- previous task: `scene-memory-01` completed with workers/prompts/domain/api/smoke evidence on `codex/scene-memory-openai`
- work: ready to start
