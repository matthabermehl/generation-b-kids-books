# Decision Log

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
