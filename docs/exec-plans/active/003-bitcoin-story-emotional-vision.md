# Bitcoin Story Emotional Vision Alignment

Generated: 2026-03-23T08:55:00-0400

## Objective
Shift the 3-7 story system from a savings-first instructional chassis toward a warmer bedtime-story experience with a stronger emotional arc, a new 5-card lesson taxonomy, and Bitcoin framed as a grounded family-values thread rather than a bolted-on concept.

## Why Now
- The merged product is operational and visually stronger, but the story-generation model still centers on "money-learning" and a universal saving/purchase structure.
- The new target product direction is clearer now:
  - emotionally relieving
  - story-first
  - bedtime-warm
  - Bitcoin-believer tone without trader energy
- The current system only offers three lesson keys and those keys under-specify the story's emotional promise.

## Locked Decisions
- Branch from `master` into `codex/bitcoin-story-emotional-vision`.
- Replace the public lesson taxonomy with five new keys:
  - `prices_change`
  - `jar_saving_limits`
  - `new_money_unfair`
  - `keep_what_you_earn`
  - `better_rules`
- Keep this pass prompt-driven only. Do not add a parent-facing mood selector.
- Keep Bitcoin as a gentle recurring presence in caregiver/narrator language.
- Preserve the current hard safety policy:
  - no hype or investment promises
  - no technical or device-first framing
  - no child decoding or explaining Bitcoin
- End the run with deployed dev proof plus downloaded sample PDFs under `.agent/artifacts/bitcoin-story-emotional-vision/`.

## Workstreams
1. Harness + lesson taxonomy
   - Add new harness tasks for taxonomy, prompting, docs, deploy/smoke, and sample downloads.
   - Add a centralized lesson-definition registry shared by UI and prompts.
   - Hard-replace the old lesson keys in domain, API, web, generated types, smoke scripts, and tests.
   - Add a one-off SQL remap for historical `books.money_lesson_key` values.
2. Story concept refactor
   - Replace the current savings-only `StoryConcept` shape with:
     - base concept fields
     - new emotional arc fields
     - a lessonScenario union keyed by `moneyLessonKey`
   - Update prompt schemas, worker parsers, mock provider fixtures, and continuity helpers to use the new shape.
3. Prompt + validator alignment
   - Reframe prompts around bedtime warmth, reassurance, and story-first Bitcoin framing.
   - Remove the universal hero's-journey / two-earning-options / two-choice-beats assumptions.
   - Add emotional-tone guidance and checks for warmth, non-preachiness, and calm resolution.
   - Keep lesson-specific Bitcoin values explicit:
     - patience
     - fair rules
     - long-term thinking
     - stewardship
     - keeping earned rewards
4. Verification + artifacts
   - Run smoke, package tests, repo quality, and UI validation.
   - Deploy dev with `pnpm cdk:deploy:dev`.
   - Run provider smoke plus two picture-book smokes:
     - `read_aloud_3_4` + `better_rules`
     - `early_decoder_5_7` + `new_money_unfair`
   - Save smoke JSON, screenshots, and downloaded PDFs under `.agent/artifacts/bitcoin-story-emotional-vision/`.

## File Hotspots
- `.agent/feature_list.json`
- `.agent/current_task.md`
- `packages/domain/src/enums.ts`
- `packages/domain/src/types.ts`
- `packages/prompts/src/templates.ts`
- `packages/prompts/src/schemas.ts`
- `apps/workers/src/providers/llm.ts`
- `apps/api/src/openapi/spec.ts`
- `apps/web/src/routes/CreateOrderPage.tsx`
- `apps/web/src/lib/parent-flow.tsx`
- `scripts/ops/picture-book-smoke.mjs`

## Verification Target
- `bash scripts/agent/smoke.sh`
- `pnpm --filter @book/domain test`
- `pnpm --filter @book/prompts test`
- `pnpm --filter @book/workers test`
- `pnpm --filter @book/api test`
- `pnpm --filter @book/web test`
- `bash scripts/agent/quality.sh`
- `bash scripts/agent/e2e.sh`
- `pnpm cdk:deploy:dev`
- `pnpm ops:provider-smoke`
- `pnpm ops:picture-book-smoke`

## Exit Criteria
- The product exposes the 5-card lesson taxonomy end to end.
- Story prompts and concept artifacts are no longer universally savings-first.
- The new lesson source of truth is shared by prompt and UI layers.
- Safety and quality checks still pass.
- Dev deploy and both live smoke runs succeed.
- Downloaded PDF artifacts and smoke evidence are stored under `.agent/artifacts/bitcoin-story-emotional-vision/`.
