# Before Branch Snapshot

Date: 2026-03-16
Source branch: master
Planned branch: codex/story-quality-hardening

## Current state
- `master` contains the recent OpenAI image cutover, spread layout work, and merged prompt/render pipeline changes.
- Baseline smoke is passing in the current session.
- Story generation quality issues remain in the writing/planning layer: skipped count sequences, generic caregiver wording, chore/action discontinuity, late unseeded deadline events, and ad-hoc Bitcoin framing.
- Current story planning pipeline goes `beat planning -> beat critics/rewrite -> page writer -> shallow final critic`, with no explicit concept/storia spine stage.
- Current final story QA is too weak for continuity and setup/payoff failures, and deterministic checks do not cover the observed story defects.

## Objective
Implement story-quality hardening for 3-7 books by:
- introducing a lightweight `StoryConcept` stage before beat planning,
- adding continuity-carrying beat fields,
- strengthening final story QA and deterministic validators,
- and adding a bounded rewrite path that routes page-level issues to page rewrite and concept/beat issues back to beat rewrite.

## Constraints
- Keep changes internal to prompts, schemas, validators, and worker orchestration; no public API/UI contract changes.
- Keep Bitcoin explicit and late for 3-7 books, but only once, as an adult line in the final two pages.
- Default caregiver wording to configurable `Mom` or `Dad` for this slice.
- Preserve existing deployment/runtime patterns unless the new story-quality flow requires a local interface extension.

## Risks
- Prompt/schema changes span multiple pipeline stages and can break existing tests or mock fixtures.
- Reusing beat rewrite for concept-level failures may require careful mapping of issue types back into rewrite instructions.
- Tightening QA too aggressively can raise failure rates or create rewrite loops if retry bounds are not enforced cleanly.
- Existing tests may encode older story-package shapes and need coordinated updates.

## Assumptions
- `master` is the correct source branch and has an upstream (`Github/master`).
- This work is architectural enough to justify an isolated feature branch and PR scaffold before implementation.
- A new task entry may need to be added to `.agent/feature_list.json` so the harness has a single source-of-truth task for this slice.

## Pending decisions already resolved for this slice
- Rollout depth: concept stage + QA hardening.
- Bitcoin policy for 3-7 books: always present late, but constrained to one concept-defined adult line.
- Caregiver policy: configurable default `Mom` or `Dad`.
