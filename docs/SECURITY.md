# Security

## Secrets
- Never commit secrets.
- Use environment variables or managed secret stores.
- Avoid printing secret-like values in logs.

## Networking
- Prefer allowlisted destinations over unrestricted outbound networking.
- Record required domains and rationale in this file.
- Current required outbound providers:
  - `api.openai.com` for structured text generation, character candidates, and `page_art`
  - `api.anthropic.com` for writer/critic fallback and moderation-related calls
  - `api.sendgrid.com` for email delivery
  - `api.stripe.com` for checkout/session verification

## High-Risk Change Gates
Escalate for human confirmation when changing:
- authentication/session handling
- payment or billing flows
- destructive data operations
- privilege boundaries
- credential, token, or key handling
- shared non-production deploys when live validation would change the active `dev` stack

<!-- HARNESS-INFERRED:START -->
## Inferred Snapshot
- Enforce no-secret logging in CI and script output.
- Keep credentials in environment variables or secret stores.
<!-- HARNESS-INFERRED:END -->
