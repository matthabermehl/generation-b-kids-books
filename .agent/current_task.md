# Current Task
Task ID: story-emotional-vision-sample-download-01

## Goal
Close the emotional-vision initiative with live smoke evidence, downloadable sample books, and deployed UI captures.

## Constraints
- Keep the repo on the new `codex/bitcoin-story-emotional-vision` branch.
- Preserve the already-landed prompting fix; do not backslide on the page-range or ending-shape behavior.
- Treat current live evidence as story-stage proof, but keep deploy/download task status honest until terminal smoke artifacts exist.
- Keep harness task status accurate as each slice lands.

## Plan (short)
1. Let the deployed live books continue or rerun them to terminal state so `.agent/artifacts/picture-book-smoke-*.json` files are captured.
2. Download final illustrated PDF artifacts once at least one emotional-vision smoke run reaches `ready`.
3. Capture any remaining deployed screenshots/evidence needed for the sample-download task.

## Evidence required
- `pnpm cdk:deploy:dev`
- `pnpm ops:provider-smoke`
- terminal `pnpm ops:picture-book-smoke` artifacts for `better_rules` / `read_aloud_3_4` and `new_money_unfair` / `early_decoder_5_7`
- downloaded final PDF artifacts under `.agent/artifacts/bitcoin-story-emotional-vision/`

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS
- work: completed 2026-03-25 after `pnpm cdk:deploy:dev`, `pnpm ops:provider-smoke`, two terminal `pnpm ops:picture-book-smoke` runs, PDF downloads, deployed screenshots, and `bash scripts/agent/quality.sh` PASS
