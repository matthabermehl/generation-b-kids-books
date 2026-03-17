# Current Task
Task ID: live-character-generation-timeout-01

## Goal
Deploy the current picture-book spread layout to dev, run the live full flow, and confirm the parent path completes all the way to a downloadable PDF.

## Constraints
- Validate against the deployed dev stack, not local mocks.
- Prefer the existing smoke scripts and deployment workflow over ad-hoc commands.
- Do not treat the story-proof PDF as success; the target artifact is the final illustrated `pdf`.

## Plan (short)
1. Keep baseline green and deploy `master` to dev with the standard CDK + web publish flow.
2. Run the live picture-book smoke and full paid-flow smoke against the deployed API.
3. Download the resulting final PDF locally, or triage and fix the live blocker if the flow still fails.

## Evidence required
- `bash scripts/agent/smoke.sh`
- `pnpm cdk:deploy:dev`
- `AWS_PROFILE=personal AWS_REGION=us-east-1 pnpm ops:provider-smoke`
- `AWS_PROFILE=personal AWS_REGION=us-east-1 API_BASE_URL=<api-url> pnpm ops:picture-book-smoke`
- `AWS_PROFILE=personal AWS_REGION=us-east-1 API_BASE_URL=<api-url> pnpm ops:phase2-e2e`

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS
- work: in progress
