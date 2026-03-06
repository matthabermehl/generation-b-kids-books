# Current Task

Task ID: review-console-01

## Goal
Revitalize the web frontend and add an internal review console plus reviewer workflow for `needs_review` books, while preserving the existing parent ordering and reader flow.

## Expected User-Visible Change
- The web app has separate parent and reviewer areas in one deployable frontend.
- Internal reviewers can sign in with the existing magic-link flow, see a review queue, inspect flagged books, and take `approve/continue`, `reject`, or `retry page` actions.
- Parent users still see the existing order/checkout/reader flow, but `needs_review` is presented as “under internal review” rather than a dead end.

## Files Expected To Change
- `apps/web/src/**/*`
- `apps/api/src/http.ts`
- `apps/api/src/openapi/spec.ts`
- `apps/api/src/lib/ssm-config.ts`
- `apps/workers/src/pipeline.ts`
- `apps/workers/src/image-worker.ts`
- `apps/workers/src/check-images.ts`
- `apps/workers/src/finalize.ts`
- `apps/workers/src/migrate.ts`
- `apps/workers/sql/001_init.sql`
- `infra/cdk/lib/book-stack.js`
- related tests, docs, and harness metadata

## Tests / Verification
- `bash scripts/agent/test.sh`
- `bash scripts/agent/quality.sh`
- targeted API, worker, and web tests for review auth, review actions, and current-attempt asset selection
- `pnpm --filter @book/web build`

## Status
- baseline: smoke PASS on branch `codex/frontend-review-console`
- current state: `apps/web` still builds but is a single-file parent app; backend has `needs_review` lifecycle and raw QA data, but no explicit review-case model, no reviewer routes/actions, and no current-attempt semantics for page retries
