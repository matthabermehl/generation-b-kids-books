# Current Task
Task ID: storybook-brand-system-01

## Goal
Create a reusable StoryWeaver-style master stylesheet and apply it across the current web UI so the routed app matches the provided visual direction.

## Constraints
- Keep the existing parent/reviewer route behavior and API contracts unchanged.
- Put the shared styling in the web app's master stylesheet instead of scattering one-off route overrides.
- Cover current screens plus reusable future-facing elements such as forms, badges, content sections, previews, and review panels.

## Plan (short)
1. Define the StoryWeaver theme tokens and reusable classes in `apps/web/src/styles.css`.
2. Restyle the shell and current routes to use the new shared classes while preserving flow logic.
3. Run focused web verification plus repo quality checks, then record evidence and update the task state.

## Evidence required
- `bash scripts/agent/smoke.sh`
- `pnpm --filter @book/web test`
- `pnpm --filter @book/web build`
- `bash scripts/agent/quality.sh`

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS
- work: completed
