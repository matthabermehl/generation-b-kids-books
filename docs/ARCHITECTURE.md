# AI Children's Book App Architecture (80% Pass)

## Scope and Environment
- Environment: `dev` only.
- Region: `us-east-1`.
- Cloud profile for CLI/CDK: `AWS_PROFILE=personal`.
- 80% runtime mode: real AWS orchestration and persistence, mock checkout, mock LLM, mock image.

## High-Level System
1. Static SPA (`apps/web`) is hosted in S3 behind CloudFront.
2. Parent users authenticate through email-link auth (`/v1/auth/request-link`, `/v1/auth/verify-link`).
3. Authenticated users create orders (`/v1/orders`) and trigger build via mock payment completion (`/v1/orders/{orderId}/mark-paid`).
4. API starts a Step Functions state machine (`BookBuild`).
5. Pipeline Lambdas generate story assets, fan out image jobs to SQS, prepare render input, then run PDF rendering on ECS Fargate.
6. Final artifacts (story JSON, prompt pack, page images, PDF) are written to S3 and indexed in Aurora.

## Runtime Components
### Frontend
- `apps/web` (Vite + React SPA)
- Features:
  - magic-link request and verification
  - order creation form (child profile + lesson + reading profile)
  - order status polling
  - book reader view
  - PDF download link retrieval

### API
- `apps/api/src/http.ts` Lambda behind API Gateway HTTP API
- Public endpoints:
  - `POST /v1/auth/request-link`
  - `POST /v1/auth/verify-link`
  - `POST /v1/orders`
  - `POST /v1/orders/{orderId}/mark-paid`
  - `GET /v1/orders/{orderId}`
  - `GET /v1/books/{bookId}`
  - `GET /v1/books/{bookId}/download?format=pdf`
- Cross-cutting:
  - JWT session auth
  - `Idempotency-Key` on all POST endpoints
  - idempotency persistence in DynamoDB
  - OpenAPI spec in `apps/api/openapi.json`

### Pipeline Workers
- `apps/workers/src/pipeline.ts`: orchestration stage actions (`prepare_story`, `generate_character_sheet`, `enqueue_page_images`, `prepare_render_input`)
- `apps/workers/src/image-worker.ts`: SQS consumer for page image generation + QA retry loop (max 2 attempts)
- `apps/workers/src/check-images.ts`: page image completion/status polling
- `apps/workers/src/finalize.ts`: marks order/book ready and registers PDF artifact
- `apps/workers/src/migrate.ts`: DB schema migration custom resource

### Renderer
- `apps/renderer` container on ECS Fargate
- Service health endpoint (`src/server.ts`)
- One-shot PDF renderer CLI (`src/cli/render-once.ts`) executed by Step Functions ECS task

### Shared Packages
- `packages/domain`: enums, types, deterministic seed and validators
- `packages/prompts`: prompt templates and deterministic quality checks

## AWS Infrastructure (CDK JavaScript)
- CDK app: `infra/cdk`
- Stack: `AiChildrensBookDevStack`
- Provisioned resources:
  - S3 buckets: web + artifacts
  - CloudFront distribution with OAC
  - API Gateway HTTP API
  - Step Functions Standard state machine (`BookBuildStateMachine`)
  - SQS queue + DLQ for image fanout
  - DynamoDB idempotency table (TTL enabled)
  - Aurora Serverless v2 PostgreSQL cluster with Data API
  - ECS cluster + Fargate service/task for renderer
  - EventBridge rule for Step Functions status events
  - CloudWatch dashboard + alarms (workflow failures, queue depth, API 5xx, renderer task health)
  - KMS CMK for artifact/state encryption where relevant
  - SSM parameter paths under `SSM_PREFIX` for secret/config lifecycle

## Data Model
Primary tables (Aurora PostgreSQL):
- `users`
- `child_profiles`
- `orders`
- `books`
- `book_artifacts`
- `pages`
- `images`
- `evaluations`

## Determinism and Content Safety Controls
- Deterministic seed: `seed = hash32(book_id + ":" + page_index + ":" + version)`
- Narrative pacing checks enforce late Bitcoin reveal (~80/20 arc)
- Reading profile constraints for `read_aloud_3_4`, `early_decoder_5_7`, `independent_8_10`
- Banned financial-claim phrase checks
- Image QA loop capped at two attempts per page

## Provider Strategy Interfaces
- LLM provider: `generateBeatSheet`, `draftPages`, `critique`
- Image provider: `generate(...)` with role-specific context
- Email provider: SendGrid adapter
- Renderer: Fargate task (`render-once` CLI)
- Payment: mock checkout flow in 80% pass (Stripe deferred)

## Deployment and Operations
- Workspace scripts:
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
  - `pnpm cdk:synth`
  - `pnpm cdk:diff`
  - `pnpm cdk:deploy:dev`
- All CDK/AWS scripts are prefixed with `AWS_PROFILE=personal`.
