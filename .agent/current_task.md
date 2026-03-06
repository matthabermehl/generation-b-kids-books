# Current Task

Task ID: picture-book-hardening-01

## Goal
Harden the fixed-layout picture-book pipeline for real-LLM dev validation, deterministic text-safe regions, and manual-review fallback on picture-book QA exhaustion.

## Constraints
- Keep the legacy image/render path working when `enable_picture_book_pipeline=false`.
- Keep public APIs additive and stable.
- Block `independent_8_10` by default.

## Plan (short)
1. Add the dedicated picture-book smoke script and richer failure artifacts.
2. Tighten shared layout geometry and deterministic text-safe protection in mask/compositor/QA code.
3. Route exhausted picture-book QA to `needs_review`, validate with tests, deploy dev, and disable `enable_mock_llm`.

## Evidence Required
- `pnpm ops:provider-smoke`
- `pnpm ops:picture-book-smoke`
- `bash scripts/agent/quality.sh`

## Status
- baseline: smoke PASS
- work: implementation complete; blocked on dev OpenAI SSM credential / `enable_mock_llm`
