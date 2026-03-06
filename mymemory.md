# Session Notes (2026-03-05)

## Pipeline remediation outcomes
- Final writer remains hard-pinned to Anthropic Opus 4.6.
- Beat planning now:
  - uses deterministic checks + critics + rewrite loop,
  - treats narrative freshness as advisory after max rewrites,
  - keeps Montessori + SoR + deterministic checks fail-closed.
- `prepare_story` now runs one story draft + one story critic pass (removed blind redraft loop that caused Opus timeout fanout).
- Pipeline Lambda timeout is 5 minutes to match real LLM latency in dev.

## Runtime behavior learned
- OpenAI structured endpoint returns archived-project auth failures in this environment; provider bypasses OpenAI after first non-retryable auth/archive error and uses Anthropic for structured stages.
- Longest latency contributors are:
  - beat planning critic calls on Anthropic,
  - Opus final draft call.

## Useful commands
- Full quality gate:
  - `bash scripts/agent/quality.sh`
- Deploy dev:
  - `pnpm cdk:deploy:dev`
- End-to-end paid-path trigger (mock checkout only):
  - `AWS_PROFILE=personal AWS_REGION=us-east-1 node .agent/run-mark-paid.mjs`

## Recent successful artifact
- `/Users/matthabermehl/scratch/ai-childrens-book/sample-story-89bc838d-af1f-4ffe-ba6e-179940a6f0d8.pdf`
