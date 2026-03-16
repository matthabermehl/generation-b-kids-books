# Before Branch Snapshot

## Current state
- Repo: `/Users/matthabermehl/scratch/ai-childrens-book`
- Source branch: `master`
- Source upstream: `Github/master`
- Baseline on source branch: `bash scripts/agent/smoke.sh` PASS on 2026-03-16
- Current picture-book stack already has:
  - approved `character_reference` reused across page generation
  - scene continuity metadata via `sceneId`, `sceneVisualDescription`, `scene-plan.json`, and `image-plan.json`
  - deterministic page composition metadata persisted in `pages.composition_json`
  - `page_art` as the canonical illustration asset and `page_preview` as the current preview asset
  - parent and reviewer flows wired to `page_art` / `page_preview`
- Current layout problem:
  - the fixed-layout picture-book product still models each story page as a single square page with live text drawn over the illustration background
  - current safeguards are white knockouts, masked art fades, and text-zone QA
  - recent generated PDFs still obscure important illustration content because text and scene composition compete on the same page

## Objective
- Replace the single-page text-over-art picture-book layout with a deterministic spread-first layout:
  - one narrative page becomes one spread
  - left page is text-only on mostly white paper
  - right page is illustration-only with generous white margins and inner-gutter safety
  - landscape spread previews become the review/reader artifact
  - final parent-facing PDF is emitted as separate physical pages in reading order for print friendliness

## Remaining work to land
1. Shared domain/layout contract
   - add a spread layout profile and spread composition type with explicit left/right page specs
   - move picture-book template selection to a single deterministic `text_left_art_right_v1` spread template in v1
2. Worker prompt/mask/QA cutover
   - remove spread-path text knockouts and same-page text-zone assumptions
   - generate page art only for the right page masked region
   - add right-page gutter safety checks and left-page text-fit/readability checks
3. Renderer/artifact cutover
   - render one landscape spread preview per story page
   - emit the final PDF as left page then right page for each spread
4. API/web/reviewer cutover
   - surface spread previews in parent and reviewer views
   - expose spread count and physical page count metadata
5. Docs/evidence
   - update architecture/product docs and record new verification evidence

## Risks
- This is a structural cross-cut affecting shared types, worker QA, renderer contracts, API payloads, reviewer UI, current-book reader UI, and documentation.
- Existing preview, review, and download flows assume one square page preview per story page; all of those paths need a consistent spread-aware contract.
- Some current tests explicitly assert text-zone spill/busy behavior that should disappear for the new spread path and must be rewritten rather than patched around.
- `page_preview` changes meaning from single-page preview to spread preview, so partial migration would produce inconsistent reviewer and parent behavior.
- The working tree already contains expected harness timestamp churn in `.agent/feature_list.json` and an untracked `output/` directory; neither should be treated as a blocker.

## Locked decisions
- Default format is strict `text-left / art-right`; no vignette art on the text page in v1.
- Use one narrative page per spread; do not compress multiple beats into a spread.
- Keep `page_art` as the right-page illustration asset.
- Repurpose `page_preview` as the landscape spread preview artifact.
- Use dual outputs:
  - review/reader: landscape spread preview
  - parent download/print: separate physical pages in reading order
- Full print-production concerns such as bleed, trim, CMYK, and imposition remain out of scope for this slice.

## Pending execution sequence
1. Branch from `master` to `codex/spread-layout-v1`.
2. Refactor shared layout types and selection to model spreads instead of same-page overlays.
3. Rework worker prompting, masking, and QA around right-page-only art generation.
4. Update renderer, API payloads, parent reader, and reviewer screens to consume spread previews plus print-page PDF output.
5. Verify with targeted tests plus `bash scripts/agent/quality.sh`, then push and open a PR back to `master`.
