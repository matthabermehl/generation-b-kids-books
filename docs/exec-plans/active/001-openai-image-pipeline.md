# OpenAI Image Pipeline Cutover

Generated: 2026-03-15T15:13:34-0400

## Objective
Replace the Fal-based image system with an OpenAI `gpt-image-1.5` image pipeline, add a pre-checkout character approval loop, and retarget render/review flows to the new image assets.

## Locked decisions
- Character approval is required before checkout.
- Character description is book-scoped.
- `gpt-image-1.5` is the default image model.
- Character candidates use `images.generate`; page images use `images.edit`.
- Page continuity uses the selected character image plus up to 2 earlier same-scene current page images.
- Backward compatibility with Fal-era assets/config is intentionally out of scope.

## Workstreams
1. Character approval flow
  - extend order/book contracts with `characterDescription`
  - add character candidate/select APIs
  - gate checkout on an approved character reference
2. Scene memory and prompt plan
   - extend beat/page planning with `sceneId` and `sceneVisualDescription`
   - derive `scene-plan.json` and `image-plan.json`
   - feed page jobs only the approved character, same-scene references, and lean prompt inputs
3. OpenAI provider cutover
   - remove Fal runtime config and provider code
   - generate `character_candidate` / `character_reference` / `page_art`
   - keep QA retries composition-driven
4. Render, review, and docs cutover
  - retarget parent/reviewer payloads and queries to `page_art`
  - keep `page_preview`
  - update docs, tests, and runbooks

## Status update
- Completed on this branch:
  - `character-approval-flow-01`
  - `characterDescription` is now book-scoped on order creation
  - `GET /v1/books/{bookId}/character`, `POST /v1/books/{bookId}/character/candidates`, and `POST /v1/books/{bookId}/character/select` are implemented
  - checkout now hard-rejects until a character candidate is explicitly selected
  - the parent dashboard now owns the generate/select loop and persists character state locally between refreshes
- Remaining high-leverage work:
  - add scene memory to beat/story artifacts (`sceneId`, `sceneVisualDescription`, `scene-plan.json`, `image-plan.json`)
  - replace worker/provider Fal generation with OpenAI `images.generate` + `images.edit`
  - retarget render/review/query layers from `scene_plate` / `page_fill` to `page_art` + reference provenance

## Verification target
- `bash scripts/agent/smoke.sh`
- `bash scripts/agent/quality.sh`
- package-specific tests for API, web, workers, renderer
- one real-provider smoke for the OpenAI image path when the code path is ready
