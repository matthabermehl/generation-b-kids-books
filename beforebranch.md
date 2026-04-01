## Current State

- Branch before split: `master` at `f8d12fd`.
- The repo is clean on synced `master`.
- `bash scripts/agent/smoke.sh` failed once due a non-deterministic renderer timeout, then passed during `debug-triage`; the bundle is saved under `.agent/triage/20260331_232219/`.
- The live `bitcoin-story-modes-deploy-smoke-01` task remains blocked externally by OpenAI image billing, so the user requested a separate local capability: run only the story-generation part and export it as Markdown on demand.
- Existing helpful seams already exist:
  - `apps/workers/src/pipeline.ts` supports `prepare_story` as a standalone Lambda action.
  - `prepare_story` persists `books/<bookId>/story.json` and `books/<bookId>/render/story-proof.pdf` before image generation.
  - `/v1/books/:bookId` already exposes persisted `pages[].text` after story preparation.
- Existing constraints to preserve:
  - do not redesign the parent flow, checkout gate, API/OpenAPI contracts, or Step Functions state machine just to support this developer convenience.
  - do not trigger character generation or page-art generation for the new path.

## Objectives

- Add the smallest ops-only path that can generate a story draft on demand and write it to a local Markdown file.
- Reuse the existing deployed auth/order/create and `prepare_story` worker logic rather than duplicating story generation in a new code path.
- Include optional cleanup so draft orders/books created for story-only export do not accumulate unnecessarily.
- Keep the change local to scripts and narrow supporting plumbing unless hidden coupling forces one extra seam.

## Risks

- Invoking `prepare_story` directly could rely on deployment/resource discovery details that are easy to hard-code incorrectly.
- Story-only runs create real database and artifact records; cleanup needs to be explicit and safe so we do not delete anything outside the fresh draft created by the command.
- The same renderer timeout that flaked during smoke could distract verification if we choose too broad a test surface for this slice.
- If the script reaches into hidden infrastructure details instead of stable stack outputs/resource names, the tool may become brittle across environments.

## Assumptions

- This feature is an internal developer or operator path, not a new parent-facing product workflow.
- It is acceptable for the command to require the same AWS profile and SSM-based environment lookup as the existing ops smoke scripts.
- It is acceptable to create a fresh draft book specifically for Markdown export, then optionally clean it up afterward.
- The Markdown output can be a simple title-plus-spreads transcript unless the implementation reveals a stronger existing artifact format we should mirror.

## Open Decisions

- Default cleanup policy: likely enable cleanup by default with an opt-out flag or env var if inspection of the current ops script style supports it cleanly.
- Data source for Markdown text: prefer `story.json` from artifact storage if that proves straightforward; fall back to `/v1/books/:bookId` page text if that is the more stable seam after `prepare_story` runs.
