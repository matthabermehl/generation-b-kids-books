## Current State

- Branch before split: `master` at `5bfa129`, after merging the prompt-hardening continuity slice.
- Working tree status before the new branch:
  - `.agent/feature_list.json` modified only because `bash scripts/agent/smoke.sh` refreshed the baseline evidence timestamp.
- Baseline smoke rerun on `master` passed on 2026-03-22 after the merge.
- The visual continuity initiative now has:
  - prompt hardening landed and merged
  - remaining open tasks for identity anchors, style-outlier QA, dev deploy/smoke, and final sample PDF capture
- Current harness desk view points at `visual-identity-anchors-01`.

## Objectives

- Run the remaining visual continuity initiative as one uninterrupted harness pass:
  - `visual-identity-anchors-01`
  - `visual-style-outlier-qa-01`
  - `visual-continuity-deploy-smoke-01`
  - `visual-sample-book-download-01`
- Keep harness artifacts current while progressing through multiple tasks in sequence rather than stopping after each one.
- Finish with a real downloaded sample-book PDF under `.agent/artifacts/visual-continuity-hardening/`.

## Risks

- The known live dependency `live-character-generation-timeout-01` may still block or slow the deploy/sample portion even if local code is correct.
- Identity anchors need to be explicit enough to prevent visible drift without overconstraining the prompts or encoding brittle phrasing.
- Style-outlier QA could introduce false positives if harmless background people are treated too aggressively.
- A long-running pass increases the chance that deploy/smoke issues will need on-the-fly debugging in the same branch.

## Assumptions

- We will branch from `master` and keep this entire pass isolated on a fresh `codex/*` branch.
- The baseline evidence timestamp update in `.agent/feature_list.json` is harmless and can travel with the new branch.
- If deploy/sample validation is blocked by live infra behavior, we will still complete as much of the pass as possible and record the exact blocker in harness artifacts.

## Open Decisions

- Exact identity-anchor shape:
  - explicit named fields vs normalized locked trait strings
- Eager supporting-reference timing:
  - immediately after `visual-bible.json` persistence vs first page-enqueue stage
- Style-outlier QA threshold:
  - always fail any outlier extra vs fail only when the extra is visually prominent enough to distract
