# Decision Log

## 2026-03-06: Add hard-vs-soft beat critic tiers with report artifacts
- Decision: beat-planning critics now classify issues as `hard` or `soft`; hard issues still drive rewrite/fail behavior, while soft-only outcomes persist `beat-plan-report.json` and allow story generation to continue.
- Rationale: Montessori/SoR/narrative feedback includes both objective blockers and advisory cleanup. Capturing advisory notes without blocking the book reduces false-negative build failures while preserving a review trail.

## 2026-03-05: Make narrative beat critic advisory after bounded rewrites
- Decision: keep deterministic + Montessori + SoR checks fail-closed, but treat `narrative_freshness` as advisory once max beat rewrites are exhausted (record warning in beat-plan audit instead of throwing).
- Rationale: narrative critic wording quality can remain unstable despite structurally valid beat plans; this avoids blocking end-to-end delivery while preserving strict pedagogical and deterministic gates.

## 2026-03-05: Remove blind Opus story redraft loop in prepare_story
- Decision: perform one final story draft + one critic pass per build, instead of repeated full re-drafts without applying critic feedback.
- Rationale: repeated Opus calls consumed the full Lambda timeout without meaningful convergence because feedback was not injected into draft regeneration.

## 2026-03-05: Increase pipeline Lambda timeout to 5 minutes
- Decision: raise `PipelineFunction` timeout from 2 minutes to 5 minutes.
- Rationale: strict beat planning plus Opus final-writing latency routinely exceeds 2 minutes in dev; higher timeout reduces false runtime failures.

## 2026-03-05: Enforce explicit mock-run authorization
- Decision: require request-level `X-Mock-Run-Tag` authorization when mock LLM/image providers are enabled, and propagate `mockRunTag` through Step Functions to worker actions.
- Rationale: prevent accidental mock-mode story generation while preserving intentional test runs.

## 2026-03-05: Fail-closed beat planning with persisted failure lineage
- Decision: if beat planning fails after rewrites, persist `beat-plan-failed.json` plus `evaluations.stage='beat_plan'` fail record, then rethrow to keep workflow failed.
- Rationale: improve diagnosis without weakening deterministic quality gates.

## 2026-03-05: Embed images in renderer output
- Decision: renderer now fetches page images from S3 and embeds binaries in PDF (PNG/JPEG direct, SVG rasterized), removing raw URL captions.
- Rationale: final artifact quality must match storybook expectations and avoid leaking storage internals.

## 2026-03-05: Add low-variation deterministic story check
- Decision: add deterministic repetition guard for final story text to flag near-identical page clusters.
- Rationale: block repetitive boilerplate outputs that pass other safety checks.

## 2026-03-05: Deep-research prompting pipeline with strict structured outputs
- Decision: refactor story generation to use structured beat planning, deterministic beat checks, three critics, and surgical beat rewrites before final drafting.
- Rationale: enforce Montessori + Science-of-Reading + anti–Mad Libs quality constraints as code, not prompt-only intent.

## 2026-03-05: Hard-pin final story writing to Anthropic Opus 4.6
- Decision: `draftPages` stage always uses Anthropic Opus 4.6 with strict schema output and no downgrade fallback.
- Rationale: prioritize final narrative quality and consistency for child-facing story text.

## 2026-03-04: Harness bootstrap first
- Decision: initialize repository with `harness-init-empty-repo` before product scaffolding.
- Rationale: requested workflow and deterministic baseline scripts/docs.

## 2026-03-04: Monorepo with pnpm workspaces + TypeScript
- Decision: use workspace layout with app and package boundaries.
- Rationale: keeps API/workers/renderer/domain/prompts cleanly separated while sharing types.

## 2026-03-04: AWS CDK in JavaScript
- Decision: infra authored in JS CDK (`infra/cdk`).
- Rationale: explicit user requirement; balances speed and maintainability.

## 2026-03-04: Real Aurora Serverless v2 now
- Decision: provision Aurora PostgreSQL with Data API in the first pass.
- Rationale: validates real persistence/integration patterns early.

## 2026-03-04: PDF rendering on ECS Fargate now
- Decision: run render task in Fargate from Step Functions.
- Rationale: validates final artifact path and avoids local-only rendering assumptions.

## 2026-03-04: Static SPA over CloudFront/S3
- Decision: Vite React SPA deployed as static assets.
- Rationale: lowest complexity delivery for parent auth/order flow.

## 2026-03-04: 80% pass used mock checkout
- Decision: implement `mark-paid` guarded endpoint and defer Stripe in phase 1.
- Rationale: unblocked orchestration and artifact testing while payment integration was pending.

## 2026-03-04: Runtime config via SSM Parameter Store prefix
- Decision: standardize config and secrets under `/ai-childrens-book/dev`.
- Rationale: consistent retrieval and promotion path.

## 2026-03-04: Phase 2 real-provider cutover
- Decision: move LLM/image/email to real providers with fallback and SSM runtime loading.
- Rationale: production-like pipeline behavior without changing public API shape.

## 2026-03-04: Phase 3 private-beta payment cutover
- Decision: Stripe becomes primary payment path with webhook-driven build start.
- Rationale: remove mock payment from normal path while retaining controlled fallback.

## 2026-03-04: Keep secrets/config source-of-truth in SSM
- Decision: keep SSM (not Secrets Manager) for this phase.
- Rationale: minimizes migration risk and reuses established runtime loaders.

## 2026-03-04: Add explicit `needs_review` lifecycle state
- Decision: add `needs_review` to order/book statuses and preserve it through failure sync.
- Rationale: safety/policy escalations should not be collapsed into generic failures.

## 2026-03-04: Pragmatic privacy baseline with async purge
- Decision: add parent self-service child profile deletion, async artifact purge queue, and privacy event audit table.
- Rationale: supports COPPA-aware data minimization and deletion flow without full compliance program overhead.

## 2026-03-04: Baseline safety hardening
- Decision: add deterministic + moderation gating before image generation and final release.
- Rationale: reduce unsafe output risk and improve private-beta trust posture.

## 2026-03-04: Dev-only private beta scope
- Decision: keep rollout in `dev` only for this phase.
- Rationale: faster iteration with lower operational overhead before staging/prod promotion.

## 2026-03-06: Fixed-layout picture-book product family
- Decision: introduce `picture_book_fixed_layout` as the primary product family for ages `3-7`.
- Rationale: `3-7` books share an illustration-heavy page model, while `8-10` needs a later chapter-book pipeline.

## 2026-03-06: Keep canonical pages layered
- Decision: persist page composition metadata, layered image assets, and live text instead of flattening page text into image generation.
- Rationale: deterministic text placement is easier to guarantee in code, and the layered model is reusable for future ebook/app outputs.

## 2026-03-06: Split fixed-layout image generation into scene and fill stages
- Decision: use `Kontext` for square scene plates and `FLUX Fill` for masked page harmonization.
- Rationale: the model handles subject/style generation, while deterministic whitespace, fade behavior, and QA remain under system control.

## 2026-03-16: Make picture-book layouts spread-first
- Decision: treat each picture-book story page as a facing spread with a text-only left page and an illustration-only right page.
- Rationale: this removes text/illustration collisions at the root, preserves generous watercolor whitespace, and keeps review/reader previews aligned with the intended book experience while still allowing print-friendly physical page export.
