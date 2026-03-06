# Current Task

Task ID: wip-carryover-01

## Goal
Implement the fixed-layout picture-book pipeline slice for ages 3-7 while preserving the legacy path behind flags.

## Constraints
- Keep the legacy image/render path working when `enable_picture_book_pipeline=false`.
- Use additive schema changes only.
- Block `independent_8_10` by default.

## Plan (short)
1. Add shared product/layout types and runtime flags.
2. Rewire workers and renderer for layered picture-book pages.
3. Expose previews through API/web and verify with tests/quality gates.

## Evidence Required
- `pnpm -r lint`
- `pnpm -r test`
- `bash scripts/agent/quality.sh`

## Status
- baseline: smoke PASS
- work: completed
