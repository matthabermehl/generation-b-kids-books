## Current State

- Branch before split: `master` tracking `Github/master`.
- Working tree before branch creation is not clean:
  - modified tracked file: `.agent/feature_list.json`
- The repository is harnessed, but the harness audit found stale managed artifacts and missing harness metadata:
  - missing `.agent/harness_version.json`
  - missing repo-root `mymemory.md`
  - stale managed blocks in `AGENTS.md`, `.agent/handoff.md`, and multiple `docs/` files
- Several `scripts/agent/` files differ from the current home harness payload, so script parity needs to be reviewed separately from the managed-doc refresh.

## Objectives

- Create a fresh `codex/refresh-harness` branch from the current `master`.
- Refresh the managed harness artifacts using the installed `harness-update-existing-repo` workflow.
- Preserve the existing local edit in `.agent/feature_list.json`.
- Inspect the resulting diff and separate safe managed refresh changes from remaining manual script drift.

## Risks

- The working tree already has a local modification, so the refresh must avoid clobbering user work.
- A harness refresh updates repo documentation and metadata blocks automatically, which can produce a wide but mechanical diff.
- Existing `scripts/agent/` drift may be intentional project customization; blindly syncing those scripts could remove repo-specific behavior.

## Assumptions

- The user wants the managed harness artifacts refreshed now.
- The existing `.agent/feature_list.json` modification should be carried forward untouched.
- We can branch from the current `master` state without stashing, since the user asked to continue in-place.

## Open Decisions

- Whether to manually sync any diverged `scripts/agent/` files after the managed refresh.
