# Last 20% Guide: AI Children's Book App

This guide is the handoff artifact to complete production-facing readiness after the 80% pass.

## 1. Switch-Over Runbook for Real-World Testing

### 1.1 Preconditions
- AWS credentials configured and valid for profile `personal`.
- Deployed `AiChildrensBookDevStack` in `us-east-1`.
- Stack outputs recorded: API URL, distribution URL, artifact bucket, state machine ARN.

### 1.2 Set SSM parameters (real keys)
Use `SecureString` for sensitive values.

```bash
AWS_PROFILE=personal AWS_REGION=us-east-1 aws ssm put-parameter --name /ai-childrens-book/dev/sendgrid_api_key --type SecureString --value '<SENDGRID_API_KEY>' --overwrite
AWS_PROFILE=personal AWS_REGION=us-east-1 aws ssm put-parameter --name /ai-childrens-book/dev/openai_api_key --type SecureString --value '<OPENAI_API_KEY>' --overwrite
AWS_PROFILE=personal AWS_REGION=us-east-1 aws ssm put-parameter --name /ai-childrens-book/dev/anthropic_api_key --type SecureString --value '<ANTHROPIC_API_KEY>' --overwrite
AWS_PROFILE=personal AWS_REGION=us-east-1 aws ssm put-parameter --name /ai-childrens-book/dev/fal_key --type SecureString --value '<FAL_KEY>' --overwrite
AWS_PROFILE=personal AWS_REGION=us-east-1 aws ssm put-parameter --name /ai-childrens-book/dev/jwt_signing_secret --type SecureString --value '<JWT_SECRET>' --overwrite
```

### 1.3 Flip mock toggles off for realistic generation
In deploy environment (or parameterized config), set:
- `ENABLE_MOCK_LLM=false`
- `ENABLE_MOCK_IMAGE=false`
- keep `ENABLE_MOCK_CHECKOUT=true` for initial smoke unless Stripe is complete.

Then redeploy:

```bash
AWS_PROFILE=personal ENABLE_MOCK_LLM=false ENABLE_MOCK_IMAGE=false pnpm cdk:deploy:dev
```

### 1.4 Smoke-test order (run in sequence)
1. `pnpm lint && pnpm test && pnpm build`
2. `pnpm openapi:generate`
3. `AWS_PROFILE=personal pnpm cdk:synth`
4. Deploy (`pnpm cdk:deploy:dev`)
5. Frontend auth flow: request link, verify link
6. Create order + mark-paid
7. Confirm Step Functions execution succeeds
8. Confirm 12+ page image artifacts in S3
9. Confirm PDF artifact generated and downloadable via API
10. Check CloudWatch dashboard and alarms show healthy baseline

## 2. Remaining Product Work

### 2.1 Payments
- Replace mock checkout with Stripe Checkout session creation.
- Add webhook verification, replay protection, and idempotent event processing.
- Add payment failure/refund lifecycle reconciliation.

### 2.2 Prompt and generation optimization
- Tune prompts with real-model outputs and QA metrics.
- Add token/image cost budgets and per-order guardrails.
- Persist model versioning for reproducibility and A/B testing.

### 2.3 LLM failover routing
- Implement active fallback chain between OpenAI and Anthropic.
- Add policy-based route selection for latency/cost/quality.
- Add circuit-breaker and per-provider error budget handling.

### 2.4 Safety and moderation hardening
- Expand content moderation (prompt, output text, image prompt, image result metadata).
- Add deny/allow policy packs and incident logging.
- Add human-review queue path for ambiguous cases.

### 2.5 Security hardening and threat modeling
- Complete threat model (auth abuse, artifact leakage, prompt injection, data exfiltration).
- Lock IAM policies further (resource-level and condition-level constraints).
- Add WAF, stricter CORS, and audit log retention/security controls.
- Rotate/encrypt operational secrets with defined cadence and detection.

### 2.6 Physical book/POD pipeline
- Integrate print-on-demand provider and order sync.
- Add print layout pipeline (bleed, trim, CMYK/300dpi, font embedding checks).
- Add shipping/status webhooks and customer notification path.

## 3. Known Risks and Mitigation Playbooks

### Risk: Model output quality drift
- Mitigation: daily canary prompt suite + regression scorecards + blocked deploy threshold.

### Risk: Generation cost spikes
- Mitigation: enforce per-order token/image caps, fallback to cheaper model tier, auto-throttle.

### Risk: Workflow stalls in async steps
- Mitigation: dead-letter monitoring, timeout alarms, replay script for safe resume.

### Risk: Unsafe or non-compliant story content
- Mitigation: deterministic + model-based safety checks and human escalation path.

### Risk: Delivery link misuse
- Mitigation: short-lived presigned URLs, auth checks, artifact access logging.

## 4. Prioritized Backlog (Effort + Dependencies)

1. Stripe checkout + webhook idempotency
- Effort: M
- Depends on: webhook endpoint, secret management, order lifecycle updates

2. Real provider adapters (OpenAI/Anthropic/fal) with retries/backoff
- Effort: M
- Depends on: SSM secret retrieval wiring, observability tags, quota handling

3. Safety policy engine and moderation pipeline
- Effort: M/L
- Depends on: provider responses, logging schema, escalation queues

4. LLM failover router + health-based routing
- Effort: M
- Depends on: multiple live provider adapters and latency metrics

5. Production security hardening package (WAF/CORS/IAM tightening)
- Effort: M
- Depends on: finalized API/CloudFront traffic model

6. POD integration + print-ready renderer upgrades
- Effort: L
- Depends on: stable story/image outputs and vendor selection

## 5. Resume Prompt (for next chat)

Use this exact starter prompt:

```text
Continue from /Users/matthabermehl/scratch/ai-childrens-book on branch codex/bitcoin-book-80-pass.
Read docs/last-20-percent-guide.md first, then implement backlog item #1 (Stripe checkout + webhook hardening) end-to-end.
Use AWS CDK JavaScript and keep all AWS/CDK CLI commands prefixed with AWS_PROFILE=personal.
Do not regress the existing mock flow; add Stripe behind a flag and include tests + rollout notes.
```
