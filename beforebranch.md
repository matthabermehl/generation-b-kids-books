# Before Branch Snapshot: Picture-Book Fixed-Layout Pipeline

## Current State
- Current branch: `master` tracking `Github/master`.
- Harness baseline smoke is passing.
- Existing production/dev pipeline is text-first plus single-pass page-image generation.
- Pages currently persist `text` plus `illustration_brief_json` only.
- Image generation currently uses a legacy `page` role with a single prompt and optional character-sheet reference.
- Render input currently carries only `text` plus `imageS3Url`.
- Renderer is a placeholder PDFKit flow that emits text-only pages with illustration source text, not composited page layouts.
- API reader response returns page text plus a single `imageUrl`.
- Web reader currently shows both page text and image inline.

## Objective
- Implement a new fixed-layout picture-book pipeline for ages 3-7 with live text, deterministic layout templates, layered assets, preview PNGs, and a renderer that can produce final PDF output while preserving backward compatibility.

## Why This Is Structural
- The change crosses shared domain types, persistence schema, worker orchestration, provider abstractions, renderer architecture, API responses, and web reader behavior.
- It introduces a new product-family path and feature-flagged rollout while preserving the legacy path.

## Scope In
- Product-family routing for `read_aloud_3_4` and `early_decoder_5_7`.
- Blocking `independent_8_10` behind a feature flag.
- Additive DB schema updates for product family, layout profile, page composition, and layered image metadata.
- Deterministic page-template selection and composition metadata.
- New scene-plate and fill provider abstractions/endpoints.
- Preview PNG generation and updated render input.
- PDF rendering with composited page art and live text.
- Additive API/web reader changes.
- Tests, docs, and rollout flags.

## Scope Out
- 8-10 chapter-book pipeline.
- Kindle/Apple export implementation.
- Read-aloud/audio features.
- 300 DPI/upscaling pass.
- POD packaging and cover/spine work.

## Key Risks
- Renderer replacement may introduce runtime/browser/dependency complexity.
- External provider payloads for Kontext/fill need to remain stable and testable behind abstractions.
- QA thresholds may need tuning once real assets are generated.
- Schema additions must stay additive to avoid breaking existing dev data.
- The legacy pipeline must remain untouched when the picture-book flag is disabled.

## Migration Notes
- Use additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` updates only.
- Bump custom-resource physical ID to force migration execution.
- Keep existing `images.role='page'` for the legacy path.
- New path will add `scene_plate`, `page_fill`, and `page_preview` rows.

## Rollback Path
- Disable `enable_picture_book_pipeline` and `enable_independent_8_10` in SSM.
- Legacy image and renderer path remains the fallback until the new path is validated.
- Schema additions are additive, so rollback is behavioral via flags rather than destructive DDL.

## Assumptions
- High-quality image generation is preferred over lower cost/latency.
- 2048x2048 working canvas is acceptable for this phase.
- Live text in final PDF is required.
- Sample PDFs in repo root are disposable local artifacts and were removed before branching.
