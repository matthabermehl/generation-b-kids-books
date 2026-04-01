# Current Task
Task ID: story-only-markdown-export-01

## Goal
Add a small internal command that can generate only the story draft for a fresh book and save it as a local Markdown transcript without running character generation, page-art generation, or final PDF rendering.

## Constraints
- Preserve the current parent checkout and character-approval product flow; this is an ops-only seam, not a UX redesign.
- Preserve the existing API/OpenAPI and Step Functions contracts unless a tiny supporting hook is strictly required.
- Reuse the existing deployed worker logic for `prepare_story` rather than duplicating story generation rules in a local script.
- Keep cleanup in mind so the command does not leave unnecessary draft orders, books, pages, or child profiles behind when the caller wants a disposable run.
- Baseline note: `bash scripts/agent/smoke.sh` failed once on `master` because of a renderer timeout but passed during `debug-triage`; evidence is under `.agent/triage/20260331_232219/`.

## Files expected
- `package.json`
- `scripts/ops/story-only-markdown.mjs`
- possibly a tiny shared helper touch if resource discovery or cleanup logic should not live inline in the new script
- harness evidence files only after verification is real

## Verification plan
- `bash scripts/agent/smoke.sh`
- targeted command run for the new ops script that proves:
  - a Markdown file is written locally
  - the story text reflects the selected story mode inputs
  - cleanup behavior is explicit and works as intended
- `bash scripts/agent/quality.sh`

## Status
- selected because the user explicitly requested an on-demand story-only Markdown path while the broader live deploy-smoke task remains externally blocked by OpenAI billing
- no implementation started yet beyond harness selection and triage capture
