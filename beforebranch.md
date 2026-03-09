# Before Branch Snapshot

## Current state
- Repo: `/Users/matthabermehl/scratch/ai-childrens-book`
- Source branch: `master`
- Source upstream: `Github/master`
- Baseline on source branch: `bash scripts/agent/smoke.sh` PASS on 2026-03-08
- Relevant frontend stack: React 18, React Router 6, Vite 5, single global stylesheet in `apps/web/src/styles.css`
- Current parent experience is a single-route dashboard-style page that mixes auth, order creation, checkout launch, reader, download, and delete actions
- Current reviewer experience already exists at `/review` and `/review/cases/:caseId` with typed API access and reviewer route gating

## Objective
- Adopt Tailwind CSS + shadcn/ui + Radix primitives as the new web UI foundation
- Migrate the entire web app to a clean product visual direction
- Redesign the parent experience into route-based steps:
  - `/`
  - `/create`
  - `/checkout`
  - `/books/current`
- Keep backend/API contracts unchanged and preserve existing localStorage keys for active session/order/book state

## Risks
- The web surface is currently centralized in one stylesheet and route-level JSX; migration will touch routing, shared layout, and reviewer pages at the same time
- Existing `.agent/feature_list.json` is already dirty in the source worktree from the latest smoke evidence update; avoid overwriting unrelated task state
- The parent checkout callback currently returns to `/` with `?checkout=success|cancel`; the redesign must preserve that contract without requiring infra changes
- Reviewer workflows depend on existing disabled-state and navigation behavior that should not regress while the UI system changes

## Assumptions locked for this branch
- Scope is whole-web-app, not parent-only
- Visual direction is clean product, not warm/editorial
- Parent flow becomes a full multi-step route flow, not just a visual reskin
- This branch is frontend-only; no backend/database/auth contract changes

## Pending implementation decisions already resolved
- Use Tailwind v4 with the Vite plugin
- Initialize shadcn with the `new-york` style, neutral/slate base, and medium radius
- Replace `StatusPill` with a shared `StatusBadge`
- Consolidate parent route state behind an internal provider while keeping current localStorage keys stable
