# Bitcoin Story Modes

Generated: 2026-03-31T18:40:00-0400

## Objective
Turn the recently centralized Bitcoin-forward policy seam into a true three-mode story system with a parent-visible selector and deterministic per-book persistence, so the pipeline can intentionally produce:

- `sound_money_implicit`: no Bitcoin mention at all, while still teaching a sound-money lesson
- `bitcoin_reveal_8020`: the monetary problem dominates most of the story, then Bitcoin arrives late as the solution
- `bitcoin_forward`: Bitcoin appears early and recurs while the child's concrete money problem stays primary

## Why Now
- The prior Bitcoin-forward work successfully centralized the story policy, but it implemented a narrower single-mode scope than the original product intent.
- The current `master` branch already has the lesson taxonomy, emotional arc model, and safety guardrails we want; what is missing is first-class mode choice and deterministic persistence of that choice.
- The shared policy seam makes this the right time to generalize rather than layering more prompt-only wording drift.

## Locked Decisions
- Keep the current 5 lesson keys and current reading profiles.
- Add a parent-facing selector in the create flow.
- Add an API request field and response field for the chosen mode.
- Persist the selected mode per book so retries, rebuilds, live review resumes, and downloads stay deterministic.
- Preserve current safety rules across every mode:
  - no hype or investment promises
  - no technical or device-first framing
  - no child decoding or explaining Bitcoin
- Keep endings emotionally warm, not lecture-like.
- Preserve the child's concrete money problem as the primary story arc in every mode.

## Workstreams
1. Shared contract and persistence
   - Introduce a shared `StoryMode` enum and thread it through domain types.
   - Add the mode to create-order request and response contracts, generated web API types, worker load context, and persisted `books` data.
   - Backfill or default historical books to `bitcoin_forward` so existing generated books remain stable.
2. Mode-aware story policy and prompts
   - Generalize the current Bitcoin policy seam into mode-aware expectations for explicitness, timing, recurrence, title guidance, and ending behavior.
   - Update story concept, beat planner, rewrite, writer, and critic prompts so each mode has a clear target:
     - implicit mode forbids Bitcoin naming
     - reveal mode delays explicit Bitcoin until the late solution window
     - forward mode keeps Bitcoin present early and recurring
3. Deterministic validation
   - Make beat and story validators agree with the mode-specific policy seam.
   - Add checks for:
     - no Bitcoin mention in implicit mode
     - late reveal timing and non-lecture ending in reveal mode
     - explicit salience and earlier recurrence in forward mode
   - Preserve safety bans and caregiver/narrator framing rules wherever Bitcoin is mentioned.
4. Parent UX, fixtures, and docs
   - Add a simple selector to the create-order screen with mode guidance copy.
   - Update prompt-principle tests, mock/fallback outputs, and docs so the repo consistently describes the three-mode architecture.
5. Verification and live proof
   - Run local smoke, targeted package tests, and repo quality.
   - Deploy dev and run live picture-book smoke across the three modes with saved JSON/PDF artifacts under `.agent/artifacts/story-modes/`.

## Expected Mode Semantics
- `sound_money_implicit`
  - no explicit Bitcoin mention in concept, beats, pages, title, or critic rewrite target
  - underlying lesson still reflects fixed-rules / scarcity / earned-value ideas through the concrete child problem
- `bitcoin_reveal_8020`
  - Bitcoin stays absent for most of the story
  - the reveal happens in the late-solution window, but not as a technical explanation dump
  - if Bitcoin appears in the ending, it should feel like a warm answer rather than a lecture
- `bitcoin_forward`
  - preserve the stronger caregiver/narrator-forward posture already shipped
  - require earlier salience and recurrence when page count allows

## File Hotspots
- `.agent/feature_list.json`
- `.agent/current_task.md`
- `.agent/progress.log`
- `beforebranch.md`
- `docs/index.md`
- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `apps/web/src/lib/parent-flow.tsx`
- `apps/web/src/routes/CreateOrderPage.tsx`
- `apps/api/src/http.ts`
- `apps/api/src/openapi/spec.ts`
- `apps/workers/src/migrate.ts`
- `apps/workers/src/pipeline.ts`
- `apps/workers/src/providers/llm.ts`
- `packages/domain/src/enums.ts`
- `packages/domain/src/types.ts`
- `packages/domain/src/bitcoin-story-policy.ts`
- `packages/domain/src/validators.ts`
- `packages/prompts/src/templates.ts`
- `packages/prompts/src/beat-quality.ts`
- `packages/prompts/src/quality.ts`

## Verification Target
- `bash scripts/agent/smoke.sh`
- `pnpm --filter @book/domain test`
- `pnpm --filter @book/prompts test`
- `pnpm --filter @book/api test`
- `pnpm --filter @book/web test`
- `pnpm --filter @book/workers test`
- `bash scripts/agent/quality.sh`
- `pnpm cdk:deploy:dev`
- `pnpm ops:provider-smoke`
- `pnpm ops:picture-book-smoke`

## Exit Criteria
- Parent flow exposes a selectable story mode.
- API and persisted book data carry the selected mode end to end.
- Domain policy, prompts, validators, and mock/fallback outputs agree on all three modes.
- Existing safety rules and warm ending rules remain intact.
- Local quality gates pass.
- Dev deploy and live smoke produce saved artifacts demonstrating all three modes.
