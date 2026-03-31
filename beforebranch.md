## Current State

- Branch before split: `master` at `876a301`.
- Baseline on synced `master`:
  - `git fetch Github master` confirms local `master` matches `Github/master`.
  - `bash scripts/agent/smoke.sh` passed on 2026-03-31 from this clean `master` state.
- The first task in the story-modes initiative is already merged:
  - `storyMode` is now a first-class shared contract.
  - `books.story_mode` is persisted.
  - the parent-facing selector exists.
  - API/OpenAPI/generated web types include the field.
  - worker context already threads the selected mode through generation.
- The remaining gap is policy and prompt behavior:
  - the shared Bitcoin story seam still mostly reflects one shipped `bitcoin_forward` posture.
  - prompt templates and prompt-principle coverage are not yet fully aligned across `sound_money_implicit`, `bitcoin_reveal_8020`, and `bitcoin_forward`.
  - some validator/test wording still encodes thresholds or language that should instead live behind the centralized policy seam.

## Objectives

- Generalize `packages/domain/src/bitcoin-story-policy.ts` so one shared seam fully describes all three supported modes:
  - `sound_money_implicit`
  - `bitcoin_reveal_8020`
  - `bitcoin_forward`
- Align story concept, beat planner, rewrite, writer, and critic prompt instructions to obey the persisted `storyMode`.
- Keep mode semantics centralized so timing, salience, title guidance, and ending behavior are not duplicated across prompt call sites or tests.
- Preserve the already-shipped `bitcoin_forward` behavior while making the two additional modes additive and deterministic.

## Risks

- Prompt copy can drift from policy if templates inline mode wording instead of deriving it from the shared seam.
- The reveal mode is easy to overcorrect into a lecture-heavy ending if the late-answer guidance is not explicit and warm.
- The implicit mode needs strong guardrails so no Bitcoin naming slips into concept/title/beats/pages/rewrite target while still teaching the underlying money lesson.
- Worker/provider tests may have baked-in Bitcoin-forward expectations that need careful adjustment without widening runtime behavior outside this task.

## Assumptions

- The current five lesson keys remain unchanged:
  - `prices_change`
  - `jar_saving_limits`
  - `new_money_unfair`
  - `keep_what_you_earn`
  - `better_rules`
- The current reading profiles remain unchanged.
- The existing parent selector, API field, and persisted per-book mode are already the right contract and should not be redesigned in this slice.
- Safety and tone constraints remain fixed across every mode:
  - no hype or investment promises
  - no technical or device-first framing
  - no child decoding or explaining Bitcoin
  - endings stay emotionally warm rather than lecture-like
  - the child's concrete money problem stays primary

## Open Decisions

- No new product decisions are expected for this slice unless hidden coupling forces a prompt/validator contract exception.
- If prompt wording and policy shape disagree, the shared policy seam should win and prompt/template wording should adapt to it rather than introducing a second source of truth.
