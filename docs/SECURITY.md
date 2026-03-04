# Security

## Secrets
- Never commit secrets.
- Use environment variables or managed secret stores.
- Avoid printing secret-like values in logs.

## Networking
- Prefer allowlisted destinations over unrestricted outbound networking.
- Record required domains and rationale in this file.

## High-Risk Change Gates
Escalate for human confirmation when changing:
- authentication/session handling
- payment or billing flows
- destructive data operations
- privilege boundaries
- credential, token, or key handling

<!-- HARNESS-INFERRED:START -->
## Inferred Snapshot
- Enforce no-secret logging in CI and script output.
- Keep credentials in environment variables or secret stores.
<!-- HARNESS-INFERRED:END -->
