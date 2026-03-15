# Before Branch Snapshot

## Current state
- Repo: `/Users/matthabermehl/scratch/ai-childrens-book`
- Source branch: `codex/scene-memory-openai`
- Source upstream: `Github/codex/scene-memory-openai`
- Baseline on source branch: `bash scripts/agent/smoke.sh` PASS on 2026-03-15 after landing `scene-memory-01`
- Landed slices on the source branch:
  - character approval before checkout
  - scene-aware beat/page planning with required `sceneId` and `sceneVisualDescription`
  - persisted `scene-plan.json` and `image-plan.json` current artifacts
- Harness state:
  - `scene-memory-01` now passes with workers/api/smoke evidence
  - `.agent/current_task.md` still needs to be advanced from `scene-memory-01` to the OpenAI image cutover task after branching
  - remaining failing tasks are `openai-image-provider-01` and `review-render-image-cutover-01`
- Current image pipeline is still split across legacy/Fal-era seams:
  - Step Functions still run `generate_character_sheet`
  - workers still generate `scene_plate` then `page_fill`
  - `check-images`, render preparation, parent payloads, reviewer payloads, retry invalidation, and smoke tooling still read `scene_plate` / `page_fill`
  - runtime config and ops scripts still depend on Fal secrets/endpoints

## Objective
- Finish the OpenAI image cutover in 2 implementation slices:
  - Slice 1: add stable scene memory contracts and persisted planning artifacts
  - Slice 2: replace the remaining Fal/two-stage image flow with a single OpenAI `page_art` flow and retarget all downstream consumers
- Preserve:
  - deterministic page composition and text-fit behavior
  - preview PNG and PDF rendering
  - manual review flow and current-asset semantics
  - checkout gating on explicit character approval

## Remaining work to land
1. Integrated `page_art` cutover
   - remove Fal runtime/config and use `models.openaiImage`
   - rename `images.fal_request_id` to `provider_request_id`
   - remove `generate_character_sheet` from orchestration; use approved `character_reference`
   - replace `scene_plate` + `page_fill` with one `page_art` generation/edit flow
   - make same-scene continuity deterministic via sequential page generation
   - retarget status checks, render preparation, reviewer payloads, parent payloads, retry invalidation, smoke scripts, and docs

## Risks
- This is a structural cross-cut touching domain types, prompt contracts, workers, Step Functions, DB migration SQL, API payloads, renderer preparation, ops scripts, and docs.
- The current queue fanout is parallel; deterministic same-scene continuity requires orchestration changes, not just prompt changes.
- Reviewer/manual retry behavior depends on current-image semantics; partial role migration would make retry/resume unsafe.
- The repo still has expected harness timestamp churn in `.agent/feature_list.json` and an unrelated untracked `output/` directory; neither should be treated as a blocker.

## Locked decisions
- Backward compatibility with Fal-era roles/config is intentionally out of scope.
- `PlannedBeat` and `StoryPage` gain `sceneId` and `sceneVisualDescription`.
- `scene_plan` and `image_plan` are current book artifacts.
- Slice 2 uses one `page_art` role plus existing `page_preview`.
- The worker uses only:
  - the approved `character_reference`
  - up to 2 earlier current `page_art` images from the same `sceneId`
- Same-scene continuity is deterministic:
  - full-book build runs page-by-page in `page_index` order
  - no scene-parallel optimization
  - no auto-requeue pass
- Reviewer/debug depth is metadata-only:
  - expose provenance through API/artifacts
  - do not redesign the reviewer UI beyond swapping the art source
- Provider persistence should be normalized now:
  - rename DB/code references from `fal_request_id` to `provider_request_id`

## Pending execution sequence
1. Branch from `codex/scene-memory-openai` for the integrated `page_art` cutover.
2. Replace the Fal/two-stage worker path with provider-neutral OpenAI `page_art` generation plus sequential orchestration.
3. Retarget API/render/review/status/ops consumers to `page_art` and provider-neutral metadata.
4. Verify with `bash scripts/agent/quality.sh` and the updated smoke scripts, then push and open a stacked PR back to `codex/scene-memory-openai`.
