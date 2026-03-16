# Before Branch Snapshot

## Source branch
- `master`
- upstream: `Github/master`

## Objective
- Implement the spread-count contract for 3-7 picture books.
- Add a first-class `story_proof_pdf` artifact generated from story text only.
- Keep the final illustrated `pdf` artifact separate and final-only.
- Update reviewer/API/docs/tests so spread vs physical-page semantics are explicit.

## Current state
- Picture-book generation already treats each persisted `pages` row as one narrative spread.
- API payloads already expose both `spreadCount` and `physicalPageCount`.
- Final renderer already outputs two physical PDF pages per spread: left text page and right art page.
- Review flows currently expose only `pdfUrl`, which points at the final illustrated PDF artifact when it exists.
- A failed story-quality run can persist `story-concept.json`, `story.json`, and `story-qa-report.json`, but there is no first-class readable proof PDF artifact.

## Constraints
- No database migration.
- No repo-wide rename from `page` to `spread`.
- Keep `/v1/books/{bookId}/download?format=pdf` bound to the final illustrated `pdf` artifact only.
- `story_proof_pdf` is internal/reviewer-facing support output, not the customer final download.

## Risks
- Existing local changes on `master` are present in:
  - `.gitignore`
  - `.agent/current_task.md`
  - `.agent/feature_list.json`
  - `apps/workers/src/providers/llm.ts`
  - `apps/workers/test/llm-provider.test.ts`
- The `llm.ts` changes are unrelated provider-routing work and should not be reverted or overwritten.
- `apps/web` test/build regenerates OpenAPI-derived files, so API schema changes will cascade into generated client output.

## Expected implementation areas
- `apps/workers/src/pipeline.ts`
- `apps/workers/src/lib/*` for proof rendering/persistence
- `apps/api/src/http.ts`
- `apps/api/src/openapi/spec.ts`
- `apps/web/src/routes/ReviewCasePage.tsx`
- `apps/web/src/routes/ReviewQueuePage.tsx`
- `apps/renderer/src/lib/render-book.ts`
- tests in workers/api/web/renderer
- product/architecture docs

## Verification target
- targeted package tests for workers, renderer, api, and web
- `bash scripts/agent/quality.sh`
