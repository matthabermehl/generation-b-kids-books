# Current Task
Task ID: bitcoin-story-modes-deploy-smoke-01

## Goal
Prove the deployed dev flow can generate downloadable sample books for each supported `storyMode` with saved smoke JSON and PDF artifacts.

## Constraints
- Treat the merged contract/persistence, policy/prompt, validator-alignment, and fixtures/docs slices as settled groundwork.
- Do not redesign the selector, API/OpenAPI contract, persistence, centralized policy seam, or validator logic unless a narrow smoke-path fix is required.
- Preserve the shared safety and tone rules across every mode:
  - no hype or investment promises
  - no technical or device-first framing
  - no child decoding or explaining Bitcoin
- Save real artifacts under `.agent/artifacts/story-modes/` before updating harness evidence.

## Plan (short)
1. Patch only the smoke/artifact path needed to exercise `storyMode` end to end and to capture per-mode JSON/PDF evidence cleanly.
2. Run the required local checks: smoke, targeted prompts/workers tests, and repo quality.
3. Deploy dev, run provider smoke plus one live picture-book smoke for each `storyMode`, and save matching JSON/PDF artifacts under `.agent/artifacts/story-modes/`.

## Evidence required
- `bash scripts/agent/smoke.sh`
- `pnpm --filter @book/prompts test`
- `pnpm --filter @book/workers test`
- `bash scripts/agent/quality.sh`
- `pnpm cdk:deploy:dev`
- `pnpm ops:provider-smoke`
- live picture-book smoke evidence for `sound_money_implicit`, `bitcoin_reveal_8020`, and `bitcoin_forward`

## Status
- branch: `codex/bitcoin-story-modes-deploy-smoke-finalpass` from clean `master` commit `f8d12fd`
- baseline: `bash scripts/agent/smoke.sh` => PASS on 2026-04-01 from this branch start point
- completed local verification on the latest branch state:
  - `pnpm --filter @book/prompts test` => PASS
  - `pnpm --filter @book/workers test` => PASS
  - `bash scripts/agent/quality.sh` => PASS
- completed deploy verification on the latest dev stack:
  - `pnpm cdk:deploy:dev` => PASS
  - `pnpm ops:provider-smoke` => PASS with `openai json=gpt-4.1 image=gpt-image-1-mini`
- completed fresh live picture-book smoke for every supported mode with downloadable PDFs:
  - `bitcoin_reveal_8020`: `.agent/artifacts/story-modes/bitcoin-reveal-8020-read-aloud-final-smoke.json` + `.agent/artifacts/story-modes/bitcoin-reveal-8020-read-aloud-final-book.pdf`
  - `sound_money_implicit`: `.agent/artifacts/story-modes/sound-money-implicit-read-aloud-final-smoke.json` + `.agent/artifacts/story-modes/sound-money-implicit-read-aloud-final-book.pdf`
  - `bitcoin_forward`: `.agent/artifacts/story-modes/bitcoin-forward-read-aloud-final-smoke.json` + `.agent/artifacts/story-modes/bitcoin-forward-read-aloud-final-book.pdf`
- task result: ready to close `bitcoin-story-modes-deploy-smoke-01` as passing
