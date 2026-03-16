# Current Task
Task ID: spread-layout-v1-01

## Goal
Replace same-page text-over-art picture-book pages with deterministic facing spreads that keep text on the left page and watercolor art on the right page.

## Constraints
- Keep `page_art` as the canonical illustration asset and `page_preview` as the spread preview artifact.
- Preserve scene continuity, character consistency, review-case semantics, and print-friendly PDF export.
- Keep the architecture scoped to picture-book fixed-layout books only.

## Plan (short)
1) Refactor shared layout and QA contracts around a single spread-first template.
2) Update worker prompting, masking, renderer output, and artifact generation for spread previews plus physical-page PDF export.
3) Retarget API/web reviewer and parent reader payloads to the new spread-preview contract and verify with quality gates.

## Evidence required
- `pnpm --filter @book/domain test`
- `pnpm --filter @book/workers test`
- `pnpm --filter @book/api test`
- `pnpm --filter @book/web test`
- `pnpm --filter @book/renderer test`
- `bash scripts/agent/quality.sh`

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS
- work: implementation complete on `codex/spread-layout-v1`
- verification:
  - `pnpm --filter @book/domain test` PASS
  - `pnpm --filter @book/workers test` PASS
  - `pnpm --filter @book/renderer test` PASS
  - `pnpm --filter @book/api test` PASS
  - `pnpm --filter @book/web test` PASS
  - `bash scripts/agent/quality.sh` PASS
