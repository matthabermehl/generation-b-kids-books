# Last 20% Guide (Post-Phase-3 / Private Beta)

Phase 3 delivered Stripe checkout/webhooks, safety review gates, and privacy deletion with async artifact purge. This guide covers run/rollback procedures and what remains for production launch.

## 1. Private-Beta Runbook

1. Convert and verify secret parameter typing:
   - `AWS_PROFILE=personal AWS_REGION=us-east-1 pnpm ops:ssm:migrate-secure`
   - Confirm these are `SecureString`:
     - `/ai-childrens-book/dev/sendgrid_api_key`
     - `/ai-childrens-book/dev/openai_api_key`
     - `/ai-childrens-book/dev/anthropic_api_key`
     - `/ai-childrens-book/dev/fal_key`
     - `/ai-childrens-book/dev/jwt_signing_secret`
     - `/ai-childrens-book/dev/stripe_secret_key`
     - `/ai-childrens-book/dev/stripe_webhook_secret`

2. Ensure required non-secret SSM keys exist:
   - `/ai-childrens-book/dev/sendgrid_from_email`
   - `/ai-childrens-book/dev/web_base_url`
   - `/ai-childrens-book/dev/auth_link_ttl_minutes`
   - `/ai-childrens-book/dev/openai_model_json`
   - `/ai-childrens-book/dev/openai_model_vision`
   - `/ai-childrens-book/dev/anthropic_model_writer`
   - `/ai-childrens-book/dev/fal_endpoint_base`
   - `/ai-childrens-book/dev/fal_endpoint_lora`
   - `/ai-childrens-book/dev/fal_endpoint_general`
   - `/ai-childrens-book/dev/fal_style_lora_url` (optional)
   - `/ai-childrens-book/dev/stripe_price_id`
   - `/ai-childrens-book/dev/stripe_success_url`
   - `/ai-childrens-book/dev/stripe_cancel_url`
   - `/ai-childrens-book/dev/enable_mock_llm`
   - `/ai-childrens-book/dev/enable_mock_image`
   - `/ai-childrens-book/dev/enable_mock_checkout`

3. Phase-3 desired runtime flags:
   - `/ai-childrens-book/dev/enable_mock_llm=false`
   - `/ai-childrens-book/dev/enable_mock_image=false`
   - `/ai-childrens-book/dev/enable_mock_checkout=false`

4. Validate external connectivity:
   - `AWS_PROFILE=personal AWS_REGION=us-east-1 pnpm ops:provider-smoke`

5. Validate payment path only:
   - `AWS_PROFILE=personal AWS_REGION=us-east-1 API_BASE_URL=<api-url> SMOKE_EMAIL=<email> pnpm ops:stripe-smoke`

6. Validate full e2e paid flow:
   - `AWS_PROFILE=personal AWS_REGION=us-east-1 API_BASE_URL=<api-url> SMOKE_EMAIL=<email> pnpm ops:phase2-e2e`

## 2. Rollback and Troubleshooting

### Fast rollback lever
1. Set fallback checkout mode in SSM:
   - `/ai-childrens-book/dev/enable_mock_checkout=true`
2. Wait for runtime config cache expiry (`RUNTIME_CONFIG_CACHE_TTL_SECONDS`, default 300s) or redeploy to force cold starts.
3. Use `/v1/orders/{orderId}/mark-paid` from trusted operators only.

### Payment failure triage
1. Check CloudWatch alarms:
   - `StripeWebhookFailureAlarm`
   - `StripeWebhookDuplicateSpikeAlarm`
2. Search API logs for:
   - `STRIPE_WEBHOOK_FAILURE`
   - `STRIPE_WEBHOOK_DUPLICATE`
   - `STRIPE_WEBHOOK_COMPLETED`
3. Query `payment_events` and `payment_sessions` to confirm event processing and dedupe behavior.

### Safety/review triage
1. Check `NeedsReviewSpikeAlarm`.
2. Search logs for `BOOK_NEEDS_REVIEW` and inspect stage values (`text_moderation`, `image_safety`, `finalize_gate`).
3. Review `evaluations` rows and `images.qa_json` for flagged reasons.

### Stuck order triage
1. Check `OrderStuckAlarm` and `OrderStuckCount` metric.
2. Inspect `orders` in `paid/building` for >45 minutes and corresponding Step Functions execution status.

## 3. Remaining Product Work (Post-Beta)

1. Production security hardening:
   - WAF, tighter IAM resource conditions, threat model, log retention policy, key rotation policy docs.

2. Human review operations:
   - internal review UI for `needs_review` cases and decision/audit workflow.

3. Cost controls:
   - enforce per-order token/image cost caps and provider budget guardrails.

4. Resilience enhancements:
   - policy-based routing and circuit breakers across model providers.

5. POD integration:
   - print-ready export (bleed/trim/300dpi), fulfillment provider integration, shipment status lifecycle.

## 4. Prioritized Backlog (Effort + Dependencies)

1. Review console + adjudication workflow
   - Effort: M
   - Depends on: `needs_review` pipeline signals (already in place)

2. Security package for production launch
   - Effort: M
   - Depends on: finalized domain/origin topology

3. Cost guardrails and billing analytics
   - Effort: M
   - Depends on: provider metadata persistence and pricing policy

4. Circuit breakers and failover policy routing
   - Effort: M
   - Depends on: baseline error metrics now live

5. POD fulfillment
   - Effort: L
   - Depends on: stable quality/review process

## 5. Resume Prompt

Use this in the next chat:

```text
Continue from /Users/matthabermehl/scratch/ai-childrens-book on branch codex/bitcoin-book-20-pass.
Read docs/last-20-percent-guide.md first, then implement the internal review console for needs_review books and the corresponding operator workflows.
Keep AWS/CDK commands prefixed with AWS_PROFILE=personal and preserve the existing Stripe + fallback checkout behavior.
Include tests for review transitions, audit logging, and release gating.
```
