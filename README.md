# AI Children's Book Builder

Monorepo for the AI children's book app (web, API, workers, renderer, and AWS CDK infra).

## Workspace Map

- `apps/web`: React SPA (parent login, order creation, status, reader/download)
- `apps/api`: HTTP API handlers (auth/orders/books/webhooks/privacy)
- `apps/workers`: pipeline, LLM/image workers, safety checks, status/finalize
- `apps/renderer`: PDF renderer service (ECS/Fargate container)
- `packages/domain`: shared domain types/enums/seed/validators
- `packages/prompts`: schema-first prompt templates, beat/page deterministic checks, and prompt-principle invariants
- `infra/cdk`: AWS CDK (JavaScript) stack
- `scripts/ops`: smoke checks and ops scripts

## Current Runtime Image Pipeline

This is the production path currently deployed in `dev`.

1. LLM generates per-page `pageText` + `illustrationBrief`, then pages are saved with `illustration_brief_json`.
   - Find it in: `apps/workers/src/providers/llm.ts`
   - Find it in: `apps/workers/src/pipeline.ts`

2. Character sheet is generated first (`role: character_sheet`) and stored in S3 + `images` table.
   - Find it in: `apps/workers/src/pipeline.ts`

3. Before page fanout, the character-sheet `s3://` URL is converted to a presigned HTTPS URL so fal can fetch it.
   - Find it in: `apps/workers/src/lib/storage.ts`
   - Find it in: `apps/workers/src/pipeline.ts`

4. Page jobs are sent to SQS with:
   - story/scene brief
   - style anchor
   - character anchor
   - `characterSheetS3Url` (trace text in prompt)
   - `characterSheetReferenceUrl` (presigned HTTPS for actual conditioning)
   - Find it in: `apps/workers/src/pipeline.ts`

5. Image worker builds the final prompt and calls the image provider with `referenceImageUrl`.
   - Find it in: `apps/workers/src/image-worker.ts`

6. fal request payload shape for page images:

```json
{
  "prompt": "...",
  "seed": 123456,
  "num_images": 1,
  "image_size": "landscape_16_9",
  "loras": [
    {
      "path": "https://.../style.safetensors",
      "scale": 0.9
    }
  ],
  "reference_image_url": "https://...presigned-character-sheet...",
  "reference_strength": 0.85
}
```

   - Find it in: `apps/workers/src/providers/image.ts`

7. Endpoint routing behavior:
   - `character_sheet`: `fal_endpoint_base` or `fal_endpoint_lora` (if style LoRA configured)
   - `page` with reference image: `fal_endpoint_general`
   - `page` without reference image: `fal_endpoint_lora` when style LoRA exists, otherwise `fal_endpoint_general`
   - Find it in: `apps/workers/src/providers/image.ts`

8. Image generation retries up to 2 attempts per page, with deterministic seeds (`hash32(bookId:pageIndex:version)`).
   - Find it in: `apps/workers/src/lib/image-attempts.ts`
   - Find it in: `packages/domain/src/seed.ts`

9. Result persistence:
   - stores `model_endpoint`, `prompt`, `seed`, `fal_request_id`, dimensions, `qa_json`, `s3_url`
   - updates page/image status to `ready` or `failed`
   - Find it in: `apps/workers/src/image-worker.ts`

## Story Prompting Pipeline

Story generation now runs as a staged pipeline:

1. Beat planner generates strict `BeatSheet` JSON with structured beat fields.
2. Deterministic beat checks enforce 80/20 timing, Montessori realism, and SoR planning heuristics.
3. Three strict critics (Montessori, SoR, narrative freshness) score beats.
4. Surgical rewrite loop fixes only flagged beats.
5. Final page writer uses Anthropic Opus 4.6 (hard-pinned) with strict schema output.
6. Beat-plan lineage is persisted to `books/<bookId>/beat-plan.json` and recorded in `evaluations` (`stage='beat_plan'`).
7. If beat planning fails after rewrites, failure lineage is persisted to `books/<bookId>/beat-plan-failed.json` before the workflow fails.
8. Deterministic final-story checks now include low-variation/repetition detection so boilerplate page text cannot pass silently.

## Runtime Config Source

Image endpoints, style LoRA URL, and mock toggles are loaded from SSM runtime config.

- Find it in: `apps/workers/src/lib/ssm-config.ts`
- Mock-provider runs are explicitly authorized with `X-Mock-Run-Tag` on `POST /v1/orders/{orderId}/mark-paid` whenever mock LLM/image flags are enabled.
- PDF renderer embeds image binaries (PNG/JPEG; SVG rasterized to PNG) and no longer prints raw `s3://...` illustration URLs.
