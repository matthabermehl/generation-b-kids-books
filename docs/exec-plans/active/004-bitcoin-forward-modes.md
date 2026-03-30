# Bitcoin-Forward Current-Lesson Alignment

Generated: 2026-03-30T18:35:00-0400

## Objective
Keep the current 5 money-problem lessons and reading profiles, but shift the shipped story system from "Bitcoin as a gentle secondary value thread" to "Bitcoin-forward in caregiver/narrator framing" without adding a parent-facing selector or per-book mode persistence.

## Why Now
- Product direction has narrowed: we are no longer trying to expose multiple Bitcoin-emphasis options in the ordering flow.
- The current pipeline already has the right lesson taxonomy, emotional arc model, and safety rules, but its Bitcoin posture is still scattered and intentionally soft.
- A centralized policy seam is the lowest-risk way to make the current experience more Bitcoin-forward now while preserving a clean extension path if selectable modes return later.

## Locked Decisions
- Stay on a single shipped Bitcoin posture for this pass:
  - Bitcoin-forward
  - still problem-led
  - still bedtime-warm
  - still inside the current money-problem lessons
- Do not add:
  - a parent-facing selector
  - an API request field
  - a `books` column
  - per-book persisted mode state
- Add one centralized Bitcoin-story policy helper/resolver and route prompts, validators, and mock/fallback outputs through it.
- Preserve current child-safety rules:
  - no hype or investment promises
  - no technical or device-first framing
  - no child decoding or explaining Bitcoin
- Preserve the emotional ending rule:
  - final pages must still land in reassurance, calm pride, closeness, or relief rather than a lecture

## Workstreams
1. Policy seam
   - Introduce a shared `BitcoinStoryPolicy` contract or equivalent resolver for the current shipped posture.
   - Encode lesson/profile-aware expectations for:
     - explicitness
     - recurring caregiver/narrator framing
     - ending guardrails
     - title guidance
   - Keep the seam implementation-only for now; no public mode switching.
2. Prompt alignment
   - Update story concept, beat planner, beat rewrite, page writer, and story critic prompts to read from the shared policy.
   - Replace wording that treats Bitcoin as merely gentle/secondary with wording that keeps the problem arc first while making Bitcoin more explicit, earlier, and more recurring.
   - Preserve lesson-specific nuance so the policy does not flatten all five lesson shapes into one tone.
3. Validation + fallback alignment
   - Update deterministic beat/story checks to reflect the new Bitcoin-forward target.
   - Rework mock/fallback story outputs and title generation so they stop hard-coding stale assumptions.
   - Add focused regression tests for:
     - beat salience expectations
     - story/page explicitness
     - ending shape
     - title behavior
4. Verification + live proof
   - Run local smoke, targeted package tests, and repo quality.
   - Deploy dev.
   - Run provider smoke plus two live picture-book smokes that show the stronger Bitcoin-forward stance across distinct lesson types.
   - Save smoke JSON and downloadable PDFs under a new `.agent/artifacts/bitcoin-forward-modes/` folder.

## File Hotspots
- `.agent/feature_list.json`
- `.agent/current_task.md`
- `beforebranch.md`
- `docs/index.md`
- `packages/prompts/src/templates.ts`
- `packages/prompts/src/prompt-principles.ts`
- `packages/prompts/src/beat-quality.ts`
- `packages/prompts/src/quality.ts`
- `packages/domain/src/validators.ts`
- `apps/workers/src/providers/llm.ts`
- `apps/workers/src/pipeline.ts`

## Expected Non-Changes
- `apps/web/src/routes/CreateOrderPage.tsx`
- `apps/web/src/lib/parent-flow.tsx`
- `apps/api/src/http.ts`
- `apps/api/src/openapi/spec.ts`
- `apps/workers/src/migrate.ts`

If one of these files needs to move, treat that as a scope exception and document why before landing it.

## Verification Target
- `bash scripts/agent/smoke.sh`
- `pnpm --filter @book/domain test`
- `pnpm --filter @book/prompts test`
- `pnpm --filter @book/workers test`
- `bash scripts/agent/quality.sh`
- `pnpm cdk:deploy:dev`
- `pnpm ops:provider-smoke`
- `pnpm ops:picture-book-smoke`

## Exit Criteria
- Bitcoin-forward behavior is defined from one shared policy seam instead of scattered hard-coded prompt language.
- Story concept, beat planning, rewrite, writer, critic, deterministic checks, and mock outputs all agree on the stronger Bitcoin-forward target.
- The current 5 lesson taxonomy and current parent/API/DB contracts remain unchanged.
- Local smoke and quality gates pass.
- Dev deploy and live smoke runs succeed with persisted artifacts under `.agent/artifacts/bitcoin-forward-modes/`.
