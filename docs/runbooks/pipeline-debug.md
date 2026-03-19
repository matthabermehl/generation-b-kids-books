# Pipeline Debug Runbook

Last updated: 2026-03-05

## Purpose
Use this runbook to debug `order -> build -> ready` failures in dev for the AI children’s book pipeline.

## Fast Path Checklist
1. Confirm baseline:
   - `bash scripts/agent/quality.sh`
2. Confirm runtime flags:
   - `AWS_PROFILE=personal AWS_REGION=us-east-1 aws ssm get-parameters --names /ai-childrens-book/dev/enable_mock_llm /ai-childrens-book/dev/enable_mock_image /ai-childrens-book/dev/enable_mock_checkout --with-decryption --query 'Parameters[].{Name:Name,Value:Value}' --output table`
3. Trigger end-to-end run:
   - `AWS_PROFILE=personal AWS_REGION=us-east-1 node .agent/run-mark-paid.mjs`
4. If failed, inspect Step Functions execution status/cause immediately.
5. Pull pipeline logs for the failing `RequestId`.
6. Check S3 artifacts (`beat-plan.json` or `beat-plan-failed.json`) for root cause.

## Critical Architecture Notes
- Final story writing is hard-pinned to `claude-opus-4-6`.
- Beat planning flow is:
  - planner -> deterministic checks -> critics -> rewrite loop.
- Blocking beat gates:
  - deterministic checks,
  - Montessori critic,
  - Science-of-Reading critic.
- Narrative freshness is advisory after max beat rewrites (warning/audit, not a hard block).
- `prepare_story` runs a bounded story draft/critic loop with rewrite history (`STORY_MAX_REWRITES`, default `2`).
- `PipelineFunction` timeout is 5 minutes.

## Known Failure Signatures

### 1) OpenAI archived/unauthorized errors
Symptoms:
- `PROVIDER_ERROR` with OpenAI 401/archived-project message.

Current behavior:
- Provider enables OpenAI bypass after first non-retryable auth/archive failure.
- Structured stages continue on Anthropic.

Action:
- Usually no code fix needed if fallback proceeds.
- If all structured calls fail, validate Anthropic key/config in SSM.

### 2) Beat plan hard failure
Symptoms:
- Step Functions error `BeatPlanningError`.
- `prepare_story` fails before page/image/render stages.

Where to inspect:
- `s3://<artifact-bucket>/books/<bookId>/beat-plan-failed.json`
- `evaluations` row with `stage='beat_plan'`, verdict `fail`.

Action:
- Inspect deterministic issues first (theme integration/SoR/Montessori/counts).
- Then inspect critic issues and rewrite lineage in the artifact.

### 3) `prepare_story` timeout
Symptoms:
- Step Functions error `Sandbox.Timedout` for pipeline lambda.

Where to inspect:
- Pipeline log stage timings:
  - `BeatPlanningComplete`
  - `StoryDraftComplete`
  - `StoryCriticComplete`
  - `StoryModerationComplete`

Action:
- If timeout occurs near story stage, check for unexpected extra drafts/loops.
- Confirm `STORY_MAX_REWRITES` is set as expected and inspect `story-qa-report.json` attempt audit for loop growth.

## Operational Commands

### Trigger and monitor build
```bash
AWS_PROFILE=personal AWS_REGION=us-east-1 node .agent/run-mark-paid.mjs
```

### Inspect Step Functions execution
```bash
AWS_PROFILE=personal AWS_REGION=us-east-1 aws stepfunctions describe-execution \
  --execution-arn <execution-arn>
```

### Tail pipeline lambda logs
```bash
AWS_PROFILE=personal AWS_REGION=us-east-1 aws logs tail \
  /aws/lambda/AiChildrensBookDevStack-PipelineFunction554661D1-Xr38t0rcyQ5G \
  --since 30m --format short
```

### Download generated PDF directly from S3
```bash
AWS_PROFILE=personal AWS_REGION=us-east-1 aws s3 cp \
  s3://aichildrensbookdevstack-artifactbucket7410c9ef-z53xyzntagew/books/<bookId>/render/book.pdf \
  ./sample-story-<bookId>.pdf
```

## Mock Guardrail Notes
- When `enable_mock_llm=true` or `enable_mock_image=true`, `mark-paid` requires `X-Mock-Run-Tag`.
- Missing tag causes explicit hard failure.
- This guardrail prevents accidental mock-generated content.

## Artifacts and Evidence to Capture
- Step Functions execution ARN and terminal status.
- Pipeline `RequestId`.
- `beat-plan.json` or `beat-plan-failed.json` path.
- Output PDF path (`books/<bookId>/render/book.pdf`) for successful runs.
