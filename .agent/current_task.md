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
- baseline: `bash scripts/agent/smoke.sh` => PASS on clean `master` commit `ad4adb8`
- previous: `bitcoin-story-modes-fixtures-docs-01` completed on `master`; next failing task selected from `.agent/feature_list.json`
- local checks: `pnpm --filter @book/prompts test` => PASS; `pnpm --filter @book/workers test` => PASS; `bash scripts/agent/quality.sh` => PASS after late-reveal prompt and rewrite-guidance fixes
- deploy: `pnpm cdk:deploy:dev` => PASS; `pnpm ops:provider-smoke` => PASS
- partial live evidence:
  - `bitcoin_forward` ready artifact: `.agent/artifacts/story-modes/bitcoin-forward-read-aloud-smoke.json`, pdf `.agent/artifacts/story-modes/bitcoin-forward-read-aloud-book.pdf`
  - `sound_money_implicit` ready artifact: `.agent/artifacts/story-modes/sound-money-implicit-read-aloud-smoke.json`, pdf `.agent/artifacts/story-modes/sound-money-implicit-read-aloud-book.pdf`
  - `bitcoin_reveal_8020` failed twice before the final rerun with `BeatPlanningError: High-salience Bitcoin beats must not appear before beat 10 in late-reveal mode` (`.agent/artifacts/story-modes/bitcoin-reveal-8020-read-aloud-smoke.json`, `.agent/artifacts/story-modes/bitcoin-reveal-8020-read-aloud-postdeploy-smoke.json`)
- blocker: fresh `finalpass` live rerun for all three modes failed before story generation because `/character/candidates` returned `OpenAI character image generation failed ... billing_hard_limit_reached`; see `.agent/artifacts/story-modes/finalpass-billing-blocker.md`
- work: blocked externally; task remains open until billing is restored and three fresh JSON/PDF artifacts are captured on the latest deploy
