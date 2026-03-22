# Visual Continuity Hardening

Generated: 2026-03-22T17:20:15-0400

## Objective
Harden the picture-book continuity pipeline so recurring humans keep stable visible identity, incidental humans cannot become style outliers, and the deployed dev flow can prove the improvements by producing and downloading a sample finished book.

## Why Now
- Recent sample feedback showed two quality gaps:
  - a recurring dad kept the same hair but drifted from Asian-presenting to Caucasian-presenting
  - a public store scene introduced a visually prominent anime-styled extra who broke the book's watercolor language
- The current pipeline already has the right architecture primitives:
  - parent-approved `character_reference`
  - `visual-bible.json`
  - optional `supporting_character_reference`
  - page contracts + prompt guidance
  - visual QA against rendered `page_art`
- This initiative tightens those primitives instead of replacing the workflow.

## Locked Decisions
- Keep the existing book-scoped character approval flow and approved `character_reference` model.
- Keep `visual-bible.json` as the continuity source of truth.
- Treat recurring story-critical humans as identity-locked once established.
- Allow incidental/background humans only when the scene semantics need them, and require them to remain low-salience and style-conformant.
- End the run with a downloaded sample PDF stored under `.agent/artifacts/visual-continuity-hardening/`.

## Known Dependency
- `live-character-generation-timeout-01` remains an open live-flow risk today. The final deployment/sample-book workstream must either confirm it is no longer blocking or resolve the blocking behavior as part of the live validation path.

## Workstreams
1. Prompt hardening
   - Add the shared watercolor style-guide language to supporting-character reference prompts.
   - Add explicit page-art prompt clauses for:
     - no new prominent humans unless the page contract requires them
     - no style-outlier extras
     - incidental humans must match the same watercolor realism and not draw focus
   - Extend prompt-level tests in `packages/domain` and `apps/workers`.
2. Identity anchors and eager recurring references
   - Extend recurring human entities with locked visible identity anchors.
   - Decide the minimal anchor shape that is stable and reviewable.
   - Generate recurring supporting-human references eagerly once the visual bible is available, instead of waiting for the first page that needs them.
   - Persist the anchors and generated references so page jobs and QA can consume them deterministically.
3. Visual QA hardening
   - Add `style_outlier_extra` to visual QA verdicts and schemas.
   - Feed identity-anchor context plus recurring-human references into QA prompts.
   - Fail pages when incidental humans are style-discordant or visually prominent enough to distract from the story.
   - Add targeted QA fixtures and regression tests.
4. Deployment and live validation
   - Run local verification:
     - `bash scripts/agent/smoke.sh`
     - `bash scripts/agent/quality.sh`
     - targeted package tests for `@book/domain`, `@book/workers`, `@book/api`, and `@book/renderer`
   - Deploy dev:
     - `pnpm cdk:deploy:dev`
   - Run live validation:
     - `pnpm ops:provider-smoke`
     - `API_BASE_URL=<dev-api> READING_PROFILE_ID=read_aloud_3_4 pnpm ops:picture-book-smoke`
     - `API_BASE_URL=<dev-api> READING_PROFILE_ID=early_decoder_5_7 pnpm ops:picture-book-smoke`
   - Capture smoke artifacts from `.agent/artifacts/picture-book-smoke-*.json`.
5. Sample-book exit artifact
   - Produce one successful dev sample book after the hardening lands.
   - Download the rendered PDF either from the signed download path or directly from S3.
   - Store:
     - sample PDF
     - smoke JSON artifact
     - book/order IDs
     - notable QA observations
     under `.agent/artifacts/visual-continuity-hardening/`.

## File Hotspots
- `packages/domain/src/visual-continuity.ts`
- `packages/domain/src/types.ts`
- `packages/domain/src/image-prompts.ts`
- `packages/domain/test/visual-continuity.test.ts`
- `apps/workers/src/lib/visual-continuity.ts`
- `apps/workers/src/lib/visual-qa.ts`
- `apps/workers/src/pipeline.ts`
- `apps/workers/src/image-worker.ts`
- `apps/workers/test/pipeline.test.ts`
- `apps/workers/test/image-worker.current-candidate.test.ts`
- `scripts/ops/picture-book-smoke.mjs`
- `docs/runbooks/pipeline-debug.md`

## Verification Target
- Baseline:
  - `bash scripts/agent/smoke.sh`
- Quality gate:
  - `bash scripts/agent/quality.sh`
- Targeted packages:
  - `pnpm --filter @book/domain test`
  - `pnpm --filter @book/workers test`
  - `pnpm --filter @book/api test`
  - `pnpm --filter @book/renderer test`
- Live:
  - `pnpm cdk:deploy:dev`
  - `pnpm ops:provider-smoke`
  - `pnpm ops:picture-book-smoke`

## Exit Criteria
- Supporting-character reference prompts inherit the same style language as the book.
- Page-art prompts explicitly suppress new prominent humans and style-outlier extras.
- Visual QA can emit `style_outlier_extra`.
- Recurring humans carry locked identity anchors and use eagerly prepared references.
- Dev deployment passes the relevant smoke path.
- A downloaded sample book PDF is saved under `.agent/artifacts/visual-continuity-hardening/`.
