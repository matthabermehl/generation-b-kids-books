# Current Task
Task ID: bitcoin-story-rewrites-01

## Goal
Replace the late-only Bitcoin story policy with positive thematic Bitcoin integration, fix the critic/validator false positives, and add a bounded multi-round story rewrite loop with full draft-and-critic history.

## Constraints
- Keep `StoryConcept.bitcoinBridge` as the existing schema field, but reinterpret it as thematic guidance instead of an exact quote.
- Preserve manual review fallback after the configured rewrite budget is exhausted.
- Keep Bitcoin child-safe: no hype, no technical/device-first framing, no child decoding or explaining Bitcoin.

## Plan (short)
1. Remove late-only Bitcoin rules from prompts, critics, and deterministic beat/story validators.
2. Add rewrite-history support to the story writer LLM call and loop story draft/critic passes in the worker pipeline.
3. Update tests and docs, then run repo quality gates.

## Evidence required
- `bash scripts/agent/smoke.sh`
- `bash scripts/agent/test.sh`
- `bash scripts/agent/quality.sh`

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS
- work: completed
