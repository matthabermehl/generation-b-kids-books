# Last 20% Guide (Post-Phase-2)

Phase 2 completed real-provider cutover and SSM runtime config loading. This guide covers what remains for production readiness and how to safely operate/rollback the current system.

## 1. Key Runbook for Real-World Testing

1. Convert and verify secret parameter typing:
   - `AWS_PROFILE=personal AWS_REGION=us-east-1 pnpm ops:ssm:migrate-secure`
   - Confirm each key is `SecureString`:
     - `/ai-childrens-book/dev/sendgrid_api_key`
     - `/ai-childrens-book/dev/openai_api_key`
     - `/ai-childrens-book/dev/anthropic_api_key`
     - `/ai-childrens-book/dev/fal_key`
     - `/ai-childrens-book/dev/jwt_signing_secret`

2. Ensure SSM non-secret config keys exist:
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
   - `/ai-childrens-book/dev/enable_mock_llm`
   - `/ai-childrens-book/dev/enable_mock_image`

3. Phase-2 desired runtime flags:
   - `/ai-childrens-book/dev/enable_mock_llm=false`
   - `/ai-childrens-book/dev/enable_mock_image=false`
   - Keep checkout mocked (`ENABLE_MOCK_CHECKOUT=true` Lambda env).

4. Validate provider/API connectivity:
   - `AWS_PROFILE=personal AWS_REGION=us-east-1 pnpm ops:provider-smoke`

5. Run full phase-2 smoke:
   - Set `API_BASE_URL` from stack output.
   - `AWS_PROFILE=personal AWS_REGION=us-east-1 API_BASE_URL=<api-url> SMOKE_EMAIL=<email> pnpm ops:phase2-e2e`

## 2. Rollback and Troubleshooting

### Rollback lever (fast)
1. Set SSM flags back to mocks:
   - `/ai-childrens-book/dev/enable_mock_llm=true`
   - `/ai-childrens-book/dev/enable_mock_image=true`
2. Wait for runtime config cache expiry (`RUNTIME_CONFIG_CACHE_TTL_SECONDS`, default 300s) or redeploy to force cold starts.

### Provider failure triage
1. Check CloudWatch alarms:
   - `ProviderErrorSpikeAlarm`
   - `SsmConfigLoadFailureAlarm`
2. Search logs for:
   - `PROVIDER_ERROR`
   - `SSM_CONFIG_LOAD_FAILURE`
3. If OpenAI fails with retryable errors, confirm Anthropic fallback events appear in worker logs.
4. For fal issues, inspect `fal_request_id` and endpoint values in `images` rows to isolate provider-side errors.

### Auth failure triage
1. Verify SendGrid key and from-email in SSM.
2. Confirm `/ai-childrens-book/dev/jwt_signing_secret` exists and decrypts.
3. Verify `WEB_BASE_URL` in SSM points to active frontend host for login links.

## 3. Remaining Product Work

1. Stripe checkout and webhook hardening:
   - Replace mock endpoint with real checkout session creation.
   - Add signature validation, replay protection, and idempotent webhook event handling.

2. Prompt tuning and cost controls:
   - Add cost budgets and hard caps per order.
   - Persist per-stage token/image cost into DB for analytics and throttling.

3. Provider routing and resilience:
   - Add policy-based OpenAI/Anthropic routing (latency/cost/quality).
   - Add circuit-breakers and per-provider health windows.

4. Moderation and safety:
   - Add text/image moderation checks for prompts and outputs.
   - Add escalation path and audit trail for blocked generations.

5. Production security hardening:
   - Threat model pass, WAF, tighter IAM/resource conditions, and log retention controls.

6. POD/print fulfillment:
   - Integrate print provider, bleed/trim/300dpi pipeline, and shipment status flow.

## 4. Prioritized Backlog (Effort + Dependencies)

1. Stripe checkout + webhook reliability
   - Effort: M
   - Depends on: payment secrets, webhook endpoint, order lifecycle table updates

2. Cost observability + guardrails
   - Effort: M
   - Depends on: provider metadata capture (already in place), reporting queries

3. Safety moderation pipeline
   - Effort: M/L
   - Depends on: provider integration stable path, policy definitions

4. Production security package
   - Effort: M
   - Depends on: finalized environment topology and domains

5. POD integration
   - Effort: L
   - Depends on: stable story/image generation quality

## 5. Resume Prompt

Use this in the next chat:

```text
Continue from /Users/matthabermehl/scratch/ai-childrens-book on branch codex/bitcoin-book-80-pass.
Read docs/last-20-percent-guide.md first, then implement Stripe checkout + webhook hardening end-to-end.
Keep AWS/CDK commands prefixed with AWS_PROFILE=personal and do not remove the existing mock fallback path.
Include tests for webhook signature verification, idempotency, and duplicate-event handling.
```
