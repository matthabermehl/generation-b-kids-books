# Before Branch Snapshot

## Current state
- Repo: `/Users/matthabermehl/scratch/ai-childrens-book`
- Source branch: `master`
- Source upstream: `Github/master`
- Baseline on source branch: `bash scripts/agent/smoke.sh` PASS on 2026-03-15
- Current pipeline still carries Fal-specific image transport and config in `apps/workers/src/providers/image.ts`, `apps/workers/src/lib/ssm-config.ts`, `apps/api/src/lib/ssm-config.ts`, and docs.
- Current picture-book path is a two-stage image flow:
  - character sheet generation in `pipeline.ts`
  - `scene_plate` generation
  - masked `page_fill` harmonization
  - `page_preview` rendering
- Parent UI currently supports routed create, checkout, and current-book flows, but it does not support pre-checkout character generation/approval.
- Reviewer UI and renderer are operational and depend on `scene_plate` / `page_fill` naming and current-asset semantics.

## Objective
- Replace the Fal/LoRA/Kontext/Fill stack with a single OpenAI image workflow based on `gpt-image-1.5`.
- Add a pre-checkout character approval loop on the parent flow:
  - parent enters a book-scoped `characterDescription`
  - parent generates up to 10 character candidates
  - parent selects one approved character reference before checkout is allowed
- Extend beat/page planning with scene continuity metadata so subsequent page edits use:
  - the approved character reference
  - up to 2 prior same-scene page images
  - a lean prompt shaped for `gpt-image-1.5`
- Keep the deterministic page composition, fade/knockout rendering, preview/PDF output, QA gating, and reviewer workflow.

## Risks
- This is a cross-cutting architectural cutover touching API contracts, DB schema, web state, worker orchestration, render inputs, reviewer payloads, runtime config, and docs in one branch.
- Existing `images` and review queries are hard-coded to `scene_plate` / `page_fill`; partial migration would break parent, reviewer, or finalize flows.
- Checkout gating is changing from “order exists” to “approved character exists,” so both API and web guards must change together.
- The repo currently has harness timestamp churn in `.agent/feature_list.json`; preserve semantic task history while replacing the obsolete Fal-focused failing task set.
- No backward compatibility is desired, so old image roles and old provider config must be removed decisively rather than left half-supported.

## Assumptions locked for this branch
- Character approval happens before checkout.
- Character description is book-scoped, not child-profile-scoped.
- No compatibility layer will be maintained for old `scene_plate` / `page_fill` assets, Fal config, or existing dev review-case payload shapes.
- The page art output remains square (`1024x1024`) and is composited into the existing square picture-book layout pipeline.
- Same-scene continuity uses the approved character image plus up to 2 earlier current `page_art` images from the same `sceneId`.

## Pending implementation decisions already resolved
- Public API adds:
  - `characterDescription` on order creation
  - `GET /v1/books/{bookId}/character`
  - `POST /v1/books/{bookId}/character/candidates`
  - `POST /v1/books/{bookId}/character/select`
- Runtime image model defaults to `gpt-image-1.5`.
- Character candidates use `images.generate`; page art uses `images.edit` with `input_fidelity=high`.
- Prompt structure follows the OpenAI cookbook pattern:
  - Scene
  - Subject / Action
  - Composition
  - Style
  - Preserve
  - Constraints
