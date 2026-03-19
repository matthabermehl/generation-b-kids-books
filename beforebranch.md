## Current State

- Branch at handoff: `master` tracking `Github/master`
- Smoke baseline: `bash scripts/agent/smoke.sh` passed on 2026-03-18
- In-progress structural change: rework Bitcoin story policy, remove late-only enforcement, fix story QA false positives, and add multi-round story rewrite loops

## Objectives

- Replace late-stage Bitcoin constraints with positive thematic integration across prompts, critics, validators, tests, and docs.
- Fix known false positives in `count_sequence` and `reading_level`.
- Preserve `bitcoinBridge` as a schema field, but reinterpret it as thematic guidance instead of an exact closing line.
- Add a configurable multi-round story draft/critic loop with rewrite history and attempt-level QA reporting.

## Existing Findings

- Recent `story-qa-report.json` artifacts show frequent failures in `bitcoin_fit`, `caregiver_consistency`, `count_sequence`, and `reading_level`.
- Latest successful books still required manual `resume_after_story_review` after one failed rewrite pass.
- Prompt/critic contradictions currently include:
  - exact or near-exact `bitcoinBridge` wording enforcement
  - `grown-ups` vs `people/adults` conflicts
  - late-only Bitcoin placement requirements
- Deterministic validator false positives currently include:
  - spoken count pages being checked against unrelated later number words on the same page
  - punctuated or hyphenated words being counted as too hard for early decoders

## Work Already Started

- `packages/domain/src/types.ts`
  - added `StoryRewriteTurn`
  - added `StoryDraftOptions`
- `packages/domain/src/providers.ts`
  - updated `draftPages(...)` to accept `options?: StoryDraftOptions`
- `packages/domain/src/validators.ts`
  - removed late-Bitcoin positional enforcement
  - softened caregiver consistency to explicit caregiver labels
  - narrowed count-sequence parsing to spoken counting scopes
  - normalized reading-profile tokenization
  - replaced Bitcoin usage checks with thematic/safety checks

## Known Risk / Immediate Follow-Up

- `packages/domain/src/validators.ts` still contains one stale `caregiverTerms` reference in `validateContinuityFacts` and will not compile until that is updated.

## Pending Decisions

- Default story rewrite budget is expected to be `STORY_MAX_REWRITES=2`, yielding 3 total drafts.
- Attempt-level QA audit shape should be finalized while updating pipeline persistence so tests can lock it in.
