# Current Task
Task ID: review-render-image-cutover-01

## Goal
Finish the OpenAI `page_art` cutover across workers, API, web, ops scripts, and docs, then verify the branch.

## Constraints
- Fal-era runtime config and image-role compatibility are intentionally out of scope.
- Full-book picture-book generation runs page-by-page in `page_index` order.
- Live dev validation requires the current branch to be deployed before the new character approval endpoints exist remotely.

## Plan (short)
1) Keep `page_art` and provenance wired end to end across render/review/status paths.
2) Verify with workers/API/web tests plus smoke and quality gates.
3) Record the live-dev smoke blocker explicitly until this branch is deployed.

## Evidence required
- `pnpm --filter @book/workers test`
- `pnpm --filter @book/api test`
- `pnpm --filter @book/web test`
- `bash scripts/agent/smoke.sh`
- `bash scripts/agent/quality.sh`

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS
- work: completed locally
- live validation: `pnpm ops:provider-smoke` PASS; `pnpm ops:picture-book-smoke` currently fails against deployed dev because `/v1/books/{bookId}/character/candidates` is not deployed there yet
