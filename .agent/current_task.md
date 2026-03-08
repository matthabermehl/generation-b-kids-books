# Current Task
Task ID: clean-product-ui-system-01

## Goal
Migrate the web app to a clean-product Tailwind and shadcn UI system, split the parent journey into routed steps, and keep the existing reviewer workflows intact.

## Constraints
- Keep backend and API contracts unchanged.
- Preserve the existing localStorage keys for auth/order/book persistence.
- Honor the current checkout callback contract on `/` with `?checkout=success|cancel`.
- Restyle the whole web app in one branch without regressing reviewer gating or current action semantics.

## Plan (short)
1) Install Tailwind v4 plus shadcn, add shared UI primitives and a parent-flow state provider, and replace the legacy global stylesheet with a thin token/global layer.
2) Refactor parent routing into `/`, `/create`, `/checkout`, and `/books/current` with redirect guards, clean-product layouts, and preserved persisted state.
3) Restyle `/verify`, `/review`, and `/review/cases/:caseId` on the same primitive layer, then verify with tests, quality gates, e2e, and screenshots.

## Evidence required
- `bash scripts/agent/smoke.sh`
- `bash scripts/agent/quality.sh`
- `bash scripts/agent/e2e.sh`
- updated route-level tests for parent and reviewer flows
- desktop and mobile screenshots for `/`, `/create`, `/checkout`, `/books/current`, `/review`, and `/review/cases/:caseId`

## Status
- verification complete: `bash scripts/agent/smoke.sh` PASS, `bash scripts/agent/quality.sh` PASS, and `bash scripts/agent/e2e.sh` returned the expected no-runner warning on `codex/clean-product-ui-system`
- next: package the verified branch into a commit and PR
