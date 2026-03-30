# Current Task
Task ID: bitcoin-forward-policy-seam-01

## Goal
Create the lowest-risk implementation seam for a single shipped Bitcoin-forward story posture while keeping the current money-problem lessons and current parent/API/DB contracts unchanged.

## Constraints
- Keep the repo on `codex/bitcoin-forward-modes`.
- Do not add a parent-facing selector, API request field, `books` column, or per-book persisted mode in this pass unless hidden coupling forces it.
- Keep the existing 5 lesson keys and current reading profiles unchanged.
- Preserve current safety rules:
  - no hype or investment promises
  - no technical or device-first framing
  - no child decoding or explaining Bitcoin
- Make the policy seam shared by prompts, validators, and mock outputs so future multi-mode work can branch cleanly from it later.

## Plan (short)
1. Add a centralized Bitcoin-story policy contract or resolver near the prompt/validation boundary.
2. Thread that policy into prompt builders, deterministic checks, and mock/fallback story outputs without widening public contracts.
3. Lock the seam with focused domain, prompt, and worker tests before moving on to broader prompt rewrites.

## Evidence required
- `pnpm --filter @book/domain test`
- `pnpm --filter @book/prompts test`
- `pnpm --filter @book/workers test`
- `bash scripts/agent/quality.sh`

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS
- work: completed 2026-03-30; shared Bitcoin-forward policy seam now drives prompt rules, deterministic checks, and worker mock/fallback titles/outputs without changing UI/API/DB contracts
- next: `bitcoin-forward-prompt-alignment-01`
