# Decision Log (80% Pass)

## 2026-03-04: Harness bootstrap first
- Decision: initialize repository with `harness-init-empty-repo` before product scaffolding.
- Rationale: requested workflow and deterministic baseline scripts/docs.

## 2026-03-04: Monorepo with pnpm workspaces + TypeScript
- Decision: use workspace layout with app and package boundaries.
- Rationale: keeps API/workers/renderer/domain/prompts cleanly separated while sharing types.

## 2026-03-04: AWS CDK in JavaScript
- Decision: infra authored in JS CDK (`infra/cdk`).
- Rationale: explicit user requirement; balances speed and maintainability for this pass.

## 2026-03-04: Real Aurora Serverless v2 now
- Decision: provision Aurora PostgreSQL with Data API in 80% pass.
- Rationale: validates real persistence/integration patterns early.

## 2026-03-04: PDF rendering on ECS Fargate now
- Decision: run render task in Fargate from Step Functions.
- Rationale: validates final artifact path and avoids local-only rendering assumptions.

## 2026-03-04: Static SPA over CloudFront/S3
- Decision: Vite React SPA deployed as static assets.
- Rationale: lowest complexity delivery for parent auth/order flow.

## 2026-03-04: Mock checkout for 80%
- Decision: implement `mark-paid` guarded endpoint; defer Stripe.
- Rationale: unblocks orchestration and artifact testing without payment-webhook complexity.

## 2026-03-04: Provider strategy pattern with mock-first runtime
- Decision: adapters for LLM/image/email; default mock for LLM/image.
- Rationale: keeps orchestration real while allowing fast, deterministic validation.

## 2026-03-04: Idempotency on POST routes
- Decision: require `Idempotency-Key` and store responses in DynamoDB with TTL.
- Rationale: prevents accidental duplicate writes/build starts and aligns with API resilience goals.

## 2026-03-04: Secrets/config pathing via SSM Parameter Store prefix
- Decision: standardize secret paths under `/ai-childrens-book/dev` (`SSM_PREFIX`).
- Rationale: consistent retrieval and easier environment promotion later.

## 2026-03-04: Stop point at 80%
- Decision: defer Stripe production flow, failover routing, advanced moderation, threat model hardening, and POD integration.
- Rationale: maximize shipped value quickly and reserve high-risk external integrations for focused phase 2.
