# Current Task

Task ID: merge-master-picture-book-01

## Goal
Merge `master` into `codex/picture-book-fixed-layout` and preserve both major feature slices: the hardened story-generation pipeline from `master` and the fixed-layout picture-book pipeline on this branch.

## Expected User-Visible Change
- Story generation keeps the beat-planning and critic flow from `master`.
- Fixed-layout picture-book books keep layered composition, preview rendering, and product-family-aware API behavior.
- Mock-run-tag protections apply consistently across legacy and picture-book execution paths.

## Files Expected To Change
- `README.md`
- `apps/api/src/http.ts`
- `apps/api/src/openapi/spec.ts`
- `apps/api/test/openapi.test.ts`
- `apps/renderer/package.json`
- `apps/renderer/src/cli/render-once.ts`
- `apps/renderer/src/lib/render-book.ts`
- `apps/workers/src/image-worker.ts`
- `apps/workers/src/pipeline.ts`
- `apps/workers/src/providers/image.ts`
- `apps/workers/src/providers/llm.ts`
- `infra/cdk/lib/book-stack.js`
- supporting tests, docs, prompts, and harness metadata

## Tests / Verification
- `pnpm -r test`
- `pnpm -r lint`
- `bash scripts/agent/quality.sh`

## Status
- baseline: smoke PASS on current branch head before merge
- work: merge in progress; conflict resolution and verification underway
