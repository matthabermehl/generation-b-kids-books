# Current Task
Task ID: live-character-generation-timeout-01

## Goal
Make the deployed pre-checkout character candidate loop operational end to end by eliminating the live `POST /v1/books/{bookId}/character/candidates` timeout in `dev`.

## Constraints
- The OpenAI image cutover code is already merged on `master`; this is now a live-integration hardening task, not a Fal compatibility task.
- API Gateway now exposes the character approval routes in `dev`, so the remaining blocker is the real request path inside `ApiFunction`.
- The current `ApiFunction` timeout is 29 seconds, and live OpenAI character generation exceeded that budget during smoke validation.

## Plan (short)
1) Decide whether to reduce synchronous character-generation latency or move candidate generation to an async/polling flow.
2) Implement the smallest safe change that keeps the parent dashboard approval loop usable.
3) Redeploy `dev` and rerun `pnpm ops:picture-book-smoke` until it completes the character approval path.

## Evidence required
- `pnpm --filter @book/api test`
- `pnpm --filter @book/cdk test`
- `bash scripts/agent/smoke.sh`
- `AWS_PROFILE=personal AWS_REGION=us-east-1 pnpm ops:provider-smoke`
- `AWS_PROFILE=personal AWS_REGION=us-east-1 API_BASE_URL=https://ufm4cqfnqe.execute-api.us-east-1.amazonaws.com pnpm ops:picture-book-smoke`

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS
- deploy: `pnpm cdk:deploy:dev` PASS after fixing the migration SQL splitter and adding missing API Gateway character routes
- live validation: `pnpm ops:provider-smoke` PASS; `pnpm ops:picture-book-smoke` now reaches the route but fails with `500`, and CloudWatch shows the `ApiFunction` request timing out after 29 seconds during character candidate generation
