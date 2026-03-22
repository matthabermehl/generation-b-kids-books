## Current State

- Branch before split: `master` at `94beef3`, tracking `Github/master`
- The working tree is already dirty with local WIP in:
  - `.agent/current_task.md`
  - `.agent/feature_list.json`
  - `apps/renderer/src/templates/picture-book-page.ts`
  - `apps/renderer/test/picture-book-page.test.ts`
  - `apps/workers/src/lib/page-canvas.ts`
  - `apps/workers/src/lib/page-qa.ts`
  - `apps/workers/test/page-canvas.test.ts`
  - `apps/workers/test/page-qa.test.ts`
  - `packages/domain/src/layouts.ts`
  - `scripts/ops/picture-book-smoke.mjs`
- Existing harness state is focused on a different in-progress task: `live-character-generation-timeout-01`
- The continuity system already includes:
  - parent-approved `character_reference` before checkout
  - `visual-bible.json` with entities and page contracts
  - lazy `supporting_character_reference` generation
  - page-art prompts with visual guidance
  - visual QA against the page contract and references

## Objectives

- Plan and stage a long-running visual continuity hardening initiative that covers:
  - style guide text in supporting-character reference prompts
  - page-prompt rules for no new prominent humans and no style-outlier extras
  - visual QA support for `style_outlier_extra`
  - locked identity anchors plus eager recurring-human reference generation
- Include repo-native harness artifacts for:
  - development sequencing
  - deployment to dev
  - validation and regression testing
  - a full sample-book run that ends with a downloaded book artifact

## Risks

- Branching from a dirty `master` worktree will preserve unrelated local edits in the new branch.
- The current dev deployment path still has an open live issue around character-generation reliability.
- Visual QA false positives are possible if style-outlier detection is introduced without careful thresholds and test fixtures.
- Identity anchoring may require decisions about how explicit we want to be when encoding visible human traits.

## Assumptions

- We will preserve all existing local edits rather than stash or discard them.
- The new work will be tracked as a fresh continuity-hardening initiative in the harness, separate from the currently stale desk view.
- A successful end state includes both local verification and a deployed dev validation that produces a downloadable sample book artifact.

## Open Decisions

- Whether to model identity anchors as fully explicit fields or as a smaller normalized list of locked visible traits.
- Whether eager recurring-character reference generation should happen immediately after `visual-bible.json` creation or as a dedicated pre-image stage in the worker pipeline.
- Whether `style_outlier_extra` should be a hard fail on every page or only when incidental humans are visually prominent enough to distract from the story.
