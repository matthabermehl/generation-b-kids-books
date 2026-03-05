# Before Branch Snapshot: AI Children's Book 80% Pass

## Current State
- Repository was empty before harness bootstrap.
- Harness initialized on `master` and created baseline automation/docs/scripts.
- No product code exists yet for web app, API, workers, renderer, domain packages, or CDK infra.
- No git remote is configured.

## Objective
- Build the 80% first-pass implementation for the AI children's book platform.
- Deliver deployable `dev` infrastructure in `us-east-1` using JavaScript CDK.
- Deliver end-to-end mock-provider flow for auth, order, generation, image artifacts, and PDF output.

## Scope In
- Static React SPA frontend.
- Lambda API for auth/orders/books/download.
- Step Functions orchestration + SQS fanout + workers.
- Aurora Serverless v2 schema/migrations and runtime persistence.
- ECS Fargate renderer task/service.
- Idempotency via DynamoDB.
- Secrets/config via SSM Parameter Store.
- `.env.example` and a `last-20-percent-guide.md` handoff doc.

## Scope Out (80% pass)
- Real Stripe checkout and webhook hardening.
- Physical print provider integration (POD logistics).
- Production-grade hardening and full compliance certification workflows.

## Key Risks
- AWS deploy may be constrained by account quotas/permissions.
- Aurora Data API/cluster setup can be sensitive to subnet/VPC defaults.
- End-to-end cloud validation depends on available AWS credentials and network permissions.
- Fargate renderer image/runtime complexity may require tuning for first deployment.

## Assumptions
- `AWS_PROFILE=personal` is available and authorized.
- Region for this pass is `us-east-1`.
- SendGrid key is available later; until then email send can be dry-run/mocked.
- Mock LLM/image adapters remain enabled by default.

## Pending Decisions (none blocking)
- Fine-grained model routing defaults before live API key phase.
- Exact production retention windows and legal text finalization.
