## Current State

- Branch before split: `master` at `5238653`.
- Baseline on `master`:
  - `bash scripts/agent/smoke.sh` passed on 2026-03-31.
  - The previously shipped Bitcoin-forward initiative is already merged to `master`.
- The current product behavior is narrower than intended:
  - prompt, validator, and worker logic assume one shipped `bitcoin_forward` posture
  - there is no first-class `storyMode` field in domain types, API requests, persisted books, or parent UI
  - retries and regeneration therefore cannot intentionally preserve distinct Bitcoin-emphasis modes
- Harness state is now misleading for the new direction:
  - `.agent/feature_list.json` has no failing tasks
  - `.agent/current_task.md` still points at the completed single-mode deploy proof
  - `docs/exec-plans/active/004-bitcoin-forward-modes.md` documents a locked single-mode scope that conflicts with the actual product goal

## Objectives

- Build a real three-mode story dial that can move between:
  - `sound_money_implicit`: no Bitcoin mention; teach the underlying money lesson only
  - `bitcoin_reveal_8020`: most of the story builds the money problem first, then Bitcoin appears late as the solution
  - `bitcoin_forward`: Bitcoin is present early and recurs while the child problem stays primary
- Make `storyMode` first-class across:
  - shared domain types and policy resolution
  - parent/web create flow
  - API request and response contracts
  - persisted `books` data so retries and regeneration stay deterministic
  - worker pipeline, prompts, validators, and mock/fallback outputs
- Reset the harness so long-running follow-up work tracks the new direction rather than the superseded single-mode plan.

## Risks

- A partial implementation could create drift where the UI offers multiple modes but retries or rebuilds silently collapse back to one posture.
- Existing deterministic checks were recently tightened around Bitcoin-forward assumptions; they must become mode-aware without weakening safety rules.
- Introducing a new persisted book field touches migrations, OpenAPI, generated web types, tests, and live smoke tooling.
- The 80/20 reveal mode needs especially careful ending rules so the Bitcoin reveal lands late without becoming preachy or technically framed.

## Assumptions

- The original lesson taxonomy stays the same:
  - `prices_change`
  - `jar_saving_limits`
  - `new_money_unfair`
  - `keep_what_you_earn`
  - `better_rules`
- The current picture-book reading profiles stay the same for this pass.
- Safety rules remain fixed across every mode:
  - no hype or investment promises
  - no technical or device-first framing
  - no child decoding, explaining, or teaching Bitcoin
- `bitcoin_forward` should preserve the effective behavior already shipped on `master`, while the other two modes become additive.

## Open Decisions

- Storage/default behavior for historical books:
  - whether to backfill existing rows to `bitcoin_forward` explicitly or rely on application defaults when the new column is absent/null
- Parent-flow UX:
  - whether the mode selector should be simple cards, segmented controls, or lesson-adjacent radio content on the create screen
- Live-proof matrix:
  - which lesson/profile combinations best demonstrate each mode distinctly during deploy smoke
