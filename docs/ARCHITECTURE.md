# AI Children's Book App Architecture (Phase 3 / Private Beta)

## Scope and Environment
- Environment: `dev` only.
- Region: `us-east-1`.
- Cloud profile for CLI/CDK: `AWS_PROFILE=personal`.
- Primary product family in this phase: `picture_book_fixed_layout` for ages `3-7`.
- Runtime mode:
  - real AWS orchestration/storage/database
  - real OpenAI/Anthropic/fal providers (controlled by SSM flags)
  - real Stripe checkout/webhooks
  - fallback mock checkout behind SSM flag only

## High-Level System
1. Static SPA (`apps/web`) is hosted in S3 behind CloudFront.
2. Parent users authenticate via email-link auth (`/v1/auth/request-link`, `/v1/auth/verify-link`).
3. Authenticated users create orders and create Stripe checkout sessions (`/v1/orders`, `/v1/orders/{orderId}/checkout`).
4. Stripe webhook (`/v1/webhooks/stripe`) verifies signature, deduplicates events, marks payment paid, and starts Step Functions `BookBuild`.
5. Pipeline Lambdas generate story assets, moderate text, fan out image jobs to SQS, run image safety checks, prepare render input, and run PDF render on ECS Fargate.
6. Final artifacts are written to S3 and indexed in Aurora; flagged books are moved to `needs_review` and blocked from release.
7. Parent can request child profile deletion (`DELETE /v1/child-profiles/{childProfileId}`) which queues artifact purge.

For `picture_book_fixed_layout` books, the image/render chain is:
1. deterministic page template selection
2. `scene_plate` generation with explicit character + style references
3. masked fill into a white page canvas with a protected text-safe region
4. deterministic white knockout + fade behind live text
5. preview PNG rendering
6. final PDF rendering with live text

## Runtime Components

### Frontend (`apps/web`)
- Magic-link auth
- Order creation
- Stripe checkout session creation
- Order polling and failure/`needs_review` visibility
- Reader view + PDF download
- Privacy control to delete child profile + artifacts

### API (`apps/api/src/http.ts`)
Public routes:
- `POST /v1/auth/request-link`
- `POST /v1/auth/verify-link`
- `POST /v1/orders`
- `POST /v1/orders/{orderId}/checkout`
- `POST /v1/orders/{orderId}/mark-paid` (fallback-only)
- `POST /v1/webhooks/stripe`
- `GET /v1/orders/{orderId}`
- `GET /v1/books/{bookId}`
- `GET /v1/books/{bookId}/download?format=pdf`
- `DELETE /v1/child-profiles/{childProfileId}`

Cross-cutting:
- JWT session auth
- `Idempotency-Key` on API-initiated POST routes
- status transition guards for order/book lifecycle
- Stripe webhook replay dedupe via `payment_events`
- runtime secrets/config from SSM (cached)

### Workers (`apps/workers`)
- `pipeline.ts`: story generation + text moderation + render preparation
- `image-worker.ts`: legacy page image generation or fixed-layout `scene_plate`/`page_fill` generation + QA
- `check-images.ts`: completion + image safety / picture-book QA escalation to `needs_review`
- `finalize.ts`: final release gate before marking `ready`
- `execution-status.ts`: Step Functions terminal failure synchronization without overriding `needs_review`
- `privacy-purge.ts`: async S3 artifact deletion + privacy event completion
- `order-health.ts`: scheduled metric emission for stuck `paid/building` orders
- `migrate.ts`: schema migration custom resource

### Renderer (`apps/renderer`)
- ECS Fargate service and one-shot render command
- picture-book render path writes per-page preview PNGs and final live-text PDF
- legacy render path remains supported for fallback books

### Shared Packages
- `packages/domain`: enums/types/validators (includes Montessori realism check)
- `packages/prompts`: prompt templates + deterministic quality checks

## AWS Infrastructure (CDK JavaScript)
- API Gateway HTTP API
- Step Functions Standard `BookBuildStateMachine`
- SQS queues:
  - image queue + DLQ
  - privacy purge queue + DLQ
- Aurora Serverless v2 PostgreSQL with Data API
- DynamoDB idempotency table
- ECS/Fargate renderer cluster and task
- CloudFront + S3 (web + artifacts)
- EventBridge rules:
  - Step Functions execution status handling
  - scheduled order-health check
- CloudWatch dashboard + alarms:
  - workflow failures
  - queue depth
  - renderer task health
  - API 5xx
  - provider errors
  - SSM config load failures
  - Stripe webhook failures / duplicate spikes
  - `needs_review` spikes
  - stuck order count

## Data Model
Core tables:
- `users`
- `child_profiles`
- `orders`
- `books`
- `book_artifacts`
- `pages`
- `images`
- `evaluations`

Phase 3 additions:
- `payment_sessions`
- `payment_events`
- `privacy_events`

Fixed-layout additions:
- `books.product_family`
- `books.layout_profile_id`
- `pages.composition_json`
- `images.parent_image_id`
- `images.input_assets_json`
- `images.mask_s3_url`

## Determinism, Safety, and Privacy Controls
- Deterministic seed: `hash32(book_id + ":" + page_index + ":" + version)`
- Deterministic page template selection for fixed-layout books
- Story checks:
  - late Bitcoin reveal (~80/20 arc)
  - banned financial claims
  - decodability checks
  - Montessori realism checks for `read_aloud_3_4`
- Content moderation:
  - text moderation gate pre-image stage
  - image prompt safety gate
  - release gate before finalization
- Fixed-layout page QA:
  - text-fit check
  - protected text-zone knockout behind live text
  - whitespace/luminance check in an inset text zone
  - contrast and art occupancy checks
- Policy-triggered `needs_review` status blocks release/download path
- Parent self-service deletion queues artifact purge and audits to `privacy_events`

## Deployment and Operations
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm openapi:generate`
- `pnpm cdk:synth`
- `pnpm cdk:diff`
- `pnpm cdk:deploy:dev`
- `pnpm ops:provider-smoke`
- `pnpm ops:picture-book-smoke`
- `pnpm ops:stripe-smoke`
- `pnpm ops:phase2-e2e` (full paid flow smoke)
