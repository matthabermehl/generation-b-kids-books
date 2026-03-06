# Current Task

Task ID: picture-book-hardening-01

## Goal
Harden the fixed-layout picture-book pipeline for real-LLM dev validation and manual-review fallback, then validate the live `dev` path with real providers.

## Expected User-Visible Change
- Fixed-layout picture-book books render with stronger text-safe whitespace protection and smarter retry behavior.
- Picture-book runs that exhaust QA retries land in `needs_review` rather than a hard `failed` state.
- The `dev` environment can be validated end-to-end with real LLM and image providers using the dedicated picture-book smoke harness.

## Files Expected To Change
- `apps/workers/src/image-worker.ts`
- `apps/workers/src/providers/image.ts`
- `apps/workers/src/providers/llm.ts`
- `apps/workers/src/lib/page-mask.ts`
- `apps/workers/src/lib/page-canvas.ts`
- `apps/workers/src/lib/page-qa.ts`
- `apps/workers/src/lib/page-template-select.ts`
- `apps/workers/src/check-images.ts`
- `scripts/ops/picture-book-smoke.mjs`
- `infra/cdk/lib/book-stack.js`
- related tests, docs, and harness metadata

## Tests / Verification
- `bash scripts/agent/smoke.sh`
- `bash scripts/agent/quality.sh`
- `pnpm ops:provider-smoke`
- `pnpm ops:picture-book-smoke`
- live dev mark-paid validation

## Status
- baseline: smoke PASS on current branch head
- work: hard-vs-soft beat critic tiers are implemented and deployed; the latest real dev run cleared beat planning, story drafting, moderation, character-sheet generation, and page-image enqueue, so the critic-stage blocker moved downstream into image generation/QA rather than PrepareStory
