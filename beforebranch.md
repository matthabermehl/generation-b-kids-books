## Current State

- Branch before split: `master` at `7b6afe3`.
- Working tree status before the new branch:
  - clean tracked tree except the harness smoke evidence timestamp update in `.agent/feature_list.json`
  - `bash scripts/agent/smoke.sh` rerun on 2026-03-30 passed from `master`
- The current product already has the 5-card money-problem lesson taxonomy and the emotional-vision prompt refactor.
- The current story pipeline still hard-codes one Bitcoin stance:
  - Bitcoin is always present
  - Bitcoin is always positive
  - Bitcoin is usually described as secondary or gentle rather than deliberately Bitcoin-forward
- The relevant logic is spread across prompt templates, deterministic validators, and mock/fallback outputs instead of one centralized policy seam.

## Objectives

- Run the Bitcoin-forward alignment on a fresh `codex/bitcoin-forward-modes` branch.
- Keep the current money-problem lessons and reading profiles unchanged.
- Make the shipped story posture more Bitcoin-forward while still keeping the child's money problem and emotional arc primary.
- Centralize Bitcoin-story rules into one reusable policy seam so future mode work can branch from a clean foundation.
- Add harness tracking for five new tasks:
  - `bitcoin-forward-policy-seam-01`
  - `bitcoin-forward-prompt-alignment-01`
  - `bitcoin-forward-validator-alignment-01`
  - `bitcoin-forward-fixtures-docs-01`
  - `bitcoin-forward-deploy-smoke-01`

## Risks

- Prompt-only wording changes will drift unless validators and mock outputs are updated in the same pass.
- Stronger Bitcoin-forward language could accidentally turn endings preachy unless ending-shape checks remain strict.
- Some lessons may naturally support different levels of explicit Bitcoin language, so a single stronger policy still needs lesson-aware nuance.
- Live smoke could regress if the new prompt stance increases critic churn or rewrite loops.

## Assumptions

- This pass does not add a parent-facing selector, API request field, database column, or per-book persisted mode.
- The requested target is one standardized shipped posture: Bitcoin-forward, but still inside the existing problem-led lesson system.
- Child-safety policy remains unchanged:
  - no hype or investment promises
  - no technical or device-first framing
  - no child decoding, teaching, or explaining Bitcoin
- We can prepare for future multi-mode support by centralizing policy now without exposing mode choice yet.

## Open Decisions

- Exact policy shape:
  - whether the shared policy should live in `packages/domain`, `packages/prompts`, or as a tiny shared contract spanning both
- Coverage target:
  - whether Bitcoin-forward should be expressed as minimum explicit mention count, beat salience distribution, title guidance, or a combination
- Live proof pair:
  - whether final live validation should emphasize `better_rules` + `read_aloud_3_4` and `jar_saving_limits` + `early_decoder_5_7`, or keep the prior fairness-heavy smoke pair
