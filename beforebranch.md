## Current State

- Branch before split: `master` at `b98cb0d`, after the visual continuity work merged back to the default branch.
- Working tree status before the new branch:
  - clean tracked tree
  - `bash scripts/agent/smoke.sh` rerun on 2026-03-23 passed from `master`
- The harness currently has no failing tasks, so this initiative needs new task entries before implementation work can be tracked.
- The current product still exposes the old 3-key lesson taxonomy and a savings-first story concept/prompt pipeline.
- The target reference tone has been reviewed from `https://bitcoinadventuresof.com/` and from the supplied 5-card lesson screenshot:
  - story-first
  - bedtime-warm
  - emotionally relieving
  - Bitcoin as a grounded values thread, not a pitch

## Objectives

- Run the Bitcoin emotional-vision initiative on a fresh `codex/bitcoin-story-emotional-vision` branch.
- Add harness tracking for five new tasks:
  - `lesson-taxonomy-refresh-01`
  - `story-emotional-vision-prompting-01`
  - `story-emotional-vision-docs-01`
  - `story-emotional-vision-deploy-smoke-01`
  - `story-emotional-vision-sample-download-01`
- Replace the public lesson taxonomy with the new 5-card set and centralize lesson metadata so UI and prompts share one source of truth.
- Refactor the story concept and prompt system away from a universal saving/purchase chassis toward lesson-specific scenarios with a stronger emotional arc.
- Finish with a dev deploy, two live smoke artifacts, and downloaded PDFs under `.agent/artifacts/bitcoin-story-emotional-vision/`.

## Risks

- The StoryConcept refactor touches prompt schemas, workers, validators, fixtures, and generated clients in one pass, so domain/prompt drift is the main regression risk.
- Hard-replacing lesson keys may expose old data assumptions in review flows, smoke scripts, or generated clients that only surface after deploy.
- A stronger emotional writing prompt could accidentally weaken existing safety guardrails unless the deterministic checks and critic prompts are updated in parallel.
- Live dev smoke still depends on external provider stability and the current deployed stack accepting the updated lesson keys.

## Assumptions

- We will keep this pass prompt-driven only: no new parent-facing mood selector and no visual redesign outside lesson-copy/layout needs.
- The screenshot's 5 lesson themes are the product target; the live reference site informs tone and sequencing, not canonical text.
- Historical stored lesson values can be remapped in-place with a one-off SQL migration because `books.money_lesson_key` is stored as `TEXT`.
- Bitcoin remains a gentle recurring presence in caregiver/narrator language, but each story still needs at least one explicit mention.

## Open Decisions

- Exact lesson-scenario field shapes for the non-saving lessons:
  - whether they need additional scenario-specific continuity keys beyond `requiredSetups` / `requiredPayoffs`
- Which live smoke lesson pair gives the clearest proof of the new emotional arc:
  - currently planned as `better_rules` for `read_aloud_3_4` and `new_money_unfair` for `early_decoder_5_7`
