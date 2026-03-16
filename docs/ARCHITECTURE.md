# AI Children's Book App Architecture (Phase 3 / Private Beta)

## Scope and Environment
- Environment: `dev` only.
- Region: `us-east-1`.
- Cloud profile for CLI/CDK: `AWS_PROFILE=personal`.
- Primary product family in this phase: `picture_book_fixed_layout` for ages `3-7`.
- Runtime mode:
  - real AWS orchestration/storage/database
  - real OpenAI/Anthropic providers (controlled by SSM flags)
  - real Stripe checkout/webhooks
  - fallback mock checkout behind SSM flag only

## High-Level System
1. Static SPA (`apps/web`) is hosted in S3 behind CloudFront.
2. Parent users authenticate via email-link auth (`/v1/auth/request-link`, `/v1/auth/verify-link`).
3. Authenticated users create orders, approve a book-scoped character reference, and then create Stripe checkout sessions (`/v1/orders`, `/v1/books/{bookId}/character*`, `/v1/orders/{orderId}/checkout`).
4. Stripe webhook (`/v1/webhooks/stripe`) verifies signature, deduplicates events, marks payment paid, and starts Step Functions `BookBuild`.
5. Pipeline Lambdas generate story assets, moderate text, fan out image jobs to SQS, run image safety checks, prepare render input, and run PDF render on ECS Fargate.
6. Final artifacts are written to S3 and indexed in Aurora; flagged books are moved to `needs_review` and blocked from release.
7. Parent can request child profile deletion (`DELETE /v1/child-profiles/{childProfileId}`) which queues artifact purge.

For `picture_book_fixed_layout` books, the image/render chain is:
1. explicit character approval before checkout
2. deterministic spread composition selection plus persisted `scene-plan.json` / `image-plan.json`
3. single-pass `page_art` generation via OpenAI image edits using the approved character reference and up to two prior same-scene pages
4. deterministic text-left / art-right spread composition with a text-only left page and masked watercolor art on the right page
5. landscape spread preview PNG rendering
6. story-proof PDF rendering from story text only so review/support always have a readable artifact
7. final PDF rendering as separate physical pages in reading order

## Runtime Components

### Frontend (`apps/web`)
- Route-based SPA with a shared session bootstrap from `GET /v1/session`
- Tailwind v4 + shadcn/Radix component system with a shared clean-product shell
- Parent shell:
  - `/` public landing page with magic-link request and checkout callback handling
  - `/create` authenticated order creation plus character generate/select flow
  - `/checkout` authenticated order summary and Stripe checkout launch
  - `/books/current` authenticated build-status, reader, download, and privacy workspace
  - persisted parent flow state backed by the existing localStorage keys for active order, checkout URL, book payload, and download URL
- Reviewer shell:
  - internal-only `/review` queue
  - `/review/cases/{caseId}` detail page with preview, final page art, scene/image plan links, provenance metadata, QA issues, and audit timeline
  - approve/continue, reject, and retry-page actions

### API (`apps/api/src/http.ts`)
Public routes:
- `POST /v1/auth/request-link`
- `POST /v1/auth/verify-link`
- `GET /v1/session`
- `POST /v1/orders`
- `GET /v1/books/{bookId}/character`
- `POST /v1/books/{bookId}/character/candidates`
- `POST /v1/books/{bookId}/character/select`
- `POST /v1/orders/{orderId}/checkout`
- `POST /v1/orders/{orderId}/mark-paid` (fallback-only)
- `POST /v1/webhooks/stripe`
- `GET /v1/orders/{orderId}`
- `GET /v1/books/{bookId}`
- `GET /v1/books/{bookId}/download?format=pdf`
- `DELETE /v1/child-profiles/{childProfileId}`

Reviewer routes:
- `GET /v1/review/cases`
- `GET /v1/review/cases/{caseId}`
- `POST /v1/review/cases/{caseId}/approve`
- `POST /v1/review/cases/{caseId}/reject`
- `POST /v1/review/cases/{caseId}/pages/{pageId}/retry`

Cross-cutting:
- JWT session auth
- reviewer authorization via SSM allowlist (`reviewer_email_allowlist`)
- `Idempotency-Key` on API-initiated POST routes
- `X-Mock-Run-Tag` required on `POST /v1/orders/{orderId}/mark-paid` when mock LLM/image flags are enabled
- status transition guards for order/book lifecycle
- Stripe webhook replay dedupe via `payment_events`
- runtime secrets/config from SSM (cached)

### Workers (`apps/workers`)
- `pipeline.ts`: beat-planning pipeline (planner -> deterministic checks -> critics -> rewrite) + story drafting + moderation + render preparation
  - fail-closed beat planning with persisted failure lineage (`beat-plan-failed.json`) before execution failure
  - beat critics emit `hard` and `soft` issues; soft-only approvals persist `beat-plan-report.json` without blocking the book
  - blocking beat gates: deterministic + Montessori + Science-of-Reading
  - narrative freshness critic remains active but is advisory after max beat rewrites (captured as audit warning)
  - final story stage runs one Opus draft + one critic pass (no blind full-redraft loop)
  - persists `story.json`, `story-qa-report.json`, and `render/story-proof.pdf` before any `finalize_gate` review stop
  - mock-provider authorization gate based on `mockRunTag`
- `image-worker.ts`: OpenAI-backed `page_art` generation for picture books plus legacy page generation fallback, prompt safety checks, and page QA
- `check-images.ts`: completion + image safety / picture-book QA escalation to `needs_review`
- `finalize.ts`: final release gate before marking `ready`
- `execution-status.ts`: Step Functions terminal failure synchronization without overriding `needs_review`
- `privacy-purge.ts`: async S3 artifact deletion + privacy event completion
- `order-health.ts`: scheduled metric emission for stuck `paid/building` orders
- `migrate.ts`: schema migration custom resource
- review lifecycle helpers:
  - open/update `review_cases` when books enter `needs_review`
  - resolve or reject review cases based on reviewer actions
  - maintain current image/artifact pointers across retries

### Renderer (`apps/renderer`)
- ECS Fargate service and one-shot render command
- picture-book render path writes landscape spread preview PNGs and a print-friendly PDF with separate left/right physical pages
- legacy render path remains supported for fallback books
- legacy render path fetches page images from S3 and embeds binaries into PDF
- supports PNG/JPEG directly and SVG via deterministic rasterization
- final illustrated `pdf` remains separate from the worker-generated `story_proof_pdf`

### Shared Packages
- `packages/domain`: enums/types/validators (includes Montessori realism check)
- `packages/prompts`: schema-first planner/critic/rewrite/writer templates + deterministic beat/story quality checks + prompt-principle invariants

## AWS Infrastructure (CDK JavaScript)
- API Gateway HTTP API
- Step Functions Standard `BookBuildStateMachine`
- SQS queues:
  - image queue + DLQ
  - privacy purge queue + DLQ
- Aurora Serverless v2 PostgreSQL with Data API
- DynamoDB idempotency table
- ECS/Fargate renderer cluster and task
- Pipeline Lambda timeout: 5 minutes (sized for strict beat planning + Opus final writing latency)
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
- `images.is_current`
- `book_artifacts.is_current`
- `review_cases`
- `review_events`

## Manual Review Flow
1. A blocking safety or QA stage sets `books.status=needs_review` and `orders.status=needs_review`.
2. The worker opens or updates a `review_case` with:
   - stage (`text_moderation`, `image_safety`, `image_qa`, `finalize_gate`)
   - summary
   - structured reason payload
3. Reviewer UI loads the current artifact set only:
   - `images.is_current = TRUE`
   - `book_artifacts.is_current = TRUE`
   - `story_proof_pdf` is the readable fallback when the final illustrated `pdf` is not available yet
4. Reviewer actions:
   - `approve_continue`: case moves to `retrying`, Step Functions resumes from the appropriate stage
   - `reject`: case resolves as rejected and the book/order become terminal `failed`
   - `retry_page`: current page image rows are superseded, that page is re-enqueued, and the case records the action in `review_events`
5. If a resumed execution clears all gates, finalization resolves the active review case as `resolved`.

## Determinism, Safety, and Privacy Controls
- Deterministic seed: `hash32(book_id + ":" + page_index + ":" + version)`
- Deterministic spread template selection for fixed-layout books
- Story checks:
  - strict beat sheet schema validation (planner, critics, rewrite, final writer)
  - late Bitcoin reveal (~80/20 arc)
  - banned financial claims
  - SoR decodability checks (beat planning + page-level checks)
  - low-variation/repetition guard for final story pages
  - Montessori realism checks for `read_aloud_3_4` and under-6 narratives
  - anti–Mad Libs narrative freshness critic
  - final story writer hard-pinned to Anthropic Opus 4.6
- Content moderation:
  - text moderation gate pre-image stage
  - image prompt safety gate
  - release gate before finalization
- Fixed-layout page QA:
  - left-page text-fit check
  - right-page gutter-safety / whitespace check
  - right-page art occupancy check
- Prompting evidence:
  - `books/<bookId>/beat-plan.json` stores planner + validator + critic + rewrite lineage
  - `books/<bookId>/beat-plan-failed.json` stores failed beat-planning lineage
  - `books/<bookId>/story.json` and `books/<bookId>/render/story-proof.pdf` are persisted before final release gating
  - `evaluations.stage='beat_plan'` captures structured beat-planning audit metadata
- Policy-triggered `needs_review` status blocks release/download path
- Parent self-service deletion queues artifact purge and audits to `privacy_events`

## Deployment and Operations
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm openapi:generate`
- `pnpm cdk:synth`
- `pnpm cdk:diff`
- `pnpm cdk:deploy:dev` (deploys infra, then builds and publishes the current `apps/web` bundle to the web bucket and invalidates CloudFront)
- `pnpm deploy:web:dev` (republish the current SPA bundle without an infra change)
- `pnpm ops:provider-smoke`
- `pnpm ops:picture-book-smoke`
- `pnpm ops:stripe-smoke`
- `pnpm ops:phase2-e2e` (full paid flow smoke)
