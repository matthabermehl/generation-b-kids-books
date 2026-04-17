## Current State

- Branch before split: `master` at `f8d12fd`.
- Baseline on clean `master`:
  - `bash scripts/agent/smoke.sh` => PASS on 2026-04-01.
  - `.agent/current_task.md` already targets `bitcoin-story-modes-deploy-smoke-01`.
- The supporting story-mode groundwork is already merged:
  - parent-visible `storyMode` selector
  - per-book `storyMode` persistence
  - centralized three-mode Bitcoin story policy seam
  - validator alignment and refreshed fixtures/docs
- The remaining gap is live proof, not product behavior:
  - local gates and deploy evidence were previously captured
  - fresh reveal-mode live proof was blocked by OpenAI image billing during `/character/candidates`
  - the task remains open until three current-mode JSON/PDF artifacts exist under `.agent/artifacts/story-modes/`

## Objectives

- Finish `bitcoin-story-modes-deploy-smoke-01` from the latest `master` baseline.
- Re-run the required local verification:
  - `bash scripts/agent/smoke.sh`
  - `pnpm --filter @book/prompts test`
  - `pnpm --filter @book/workers test`
  - `bash scripts/agent/quality.sh`
- Deploy dev and then capture real provider + live picture-book smoke evidence for:
  - `sound_money_implicit`
  - `bitcoin_reveal_8020`
  - `bitcoin_forward`
- Save matching smoke JSON plus downloadable final PDFs under `.agent/artifacts/story-modes/`.
- Update harness evidence only after the fresh artifacts are real.

## Risks

- OpenAI image billing or rate limits may still fail `/character/candidates` before story generation starts.
- Reveal mode can still expose hidden coupling if the latest live prompts regress into an early high-salience Bitcoin beat.
- Live smoke runs are expensive and time-consuming, so retries should stay narrow and artifact-driven.
- This task should avoid accidental redesign of the selector, persistence, policy seam, or validators while chasing live proof.

## Assumptions

- The current deployed API base remains `https://ufm4cqfnqe.execute-api.us-east-1.amazonaws.com` unless deploy output says otherwise.
- Existing story-mode semantics are correct; only narrow smoke-path fixes are allowed if live coupling forces them.
- The current artifact directory `.agent/artifacts/story-modes/` remains the source of truth for final evidence.
- Dev deployment and smoke work are acceptable repo-side effects for this harness task.

## Open Decisions

- If live smoke fails again, prefer the smallest evidence-backed fix and preserve any failed JSON artifacts before retrying.
- If the remaining blocker is purely external billing or provider availability, keep the task open and document that explicitly instead of forcing unrelated code changes.
