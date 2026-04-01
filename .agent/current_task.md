# Current Task
Task ID: bitcoin-story-modes-fixtures-docs-01

## Goal
Refresh fixtures, mock outputs, prompt principles, and docs so the repo consistently describes the three-mode story-mode architecture after validator alignment.

## Constraints
- Treat the merged contract/persistence, policy/prompt, and validator-alignment slices as settled groundwork.
- Keep the existing parent-visible selector, API/OpenAPI field, and persisted per-book mode exactly as already merged.
- Preserve the shared safety and tone rules across every mode:
  - no hype or investment promises
  - no technical or device-first framing
  - no child decoding or explaining Bitcoin
- Keep endings emotionally warm, not lecture-like, and keep the child's concrete money problem primary in every mode.

## Plan (short)
1. Refresh mock or fallback outputs, prompt-principle expectations, and any targeted fixtures so all three `storyMode` postures match the shared policy seam and the new validator behavior.
2. Update the active docs and execution notes so the repo consistently describes the persisted selector, the mode semantics, and the validator-backed safety posture.
3. Verify with targeted prompts/workers checks and repo quality before handing off to the deploy-smoke slice.

## Evidence required
- `pnpm --filter @book/prompts test`
- `pnpm --filter @book/workers test`
- `bash scripts/agent/quality.sh`

## Status
- baseline: `bash scripts/agent/smoke.sh` => PASS on clean `master` commit `462be30`
- previous: `bitcoin-story-modes-validator-alignment-01` completed locally with passing smoke, domain, prompts, workers, and quality evidence
- work: complete
- evidence:
  - `pnpm --filter @book/prompts test` => PASS
  - `pnpm --filter @book/workers test` => PASS
  - `bash scripts/agent/quality.sh` => PASS
- next: move to `bitcoin-story-modes-deploy-smoke-01`
