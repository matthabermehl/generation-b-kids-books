# Current Task
Task ID: picture-book-hardening-01

## Goal
Harden the fixed-layout picture-book pipeline so long text fits deterministically, overflow retries walk better layouts before review fallback, and dev migrations rerun when schema SQL changes.

## Constraints
- Keep the current 12-page story flow and review semantics intact.
- Fix root causes, not one-off content exceptions or manual database patches.
- End with real dev validation evidence, including schema verification and UI/download behavior.

## Plan (short)
1) Move shared text-fit logic into `@book/domain` and make page-template ranking capacity-aware.
2) Add tall picture-book layouts, template-aware font floors, and deterministic overflow candidate walking in the worker.
3) Update renderer/tests to consume the shared fit logic, hash migration source content in CDK, then redeploy dev and rerun the real UI flow.

## Evidence required
- `bash scripts/agent/smoke.sh`
- `bash scripts/agent/quality.sh`
- unit/integration tests covering new template ordering and overflow regressions
- dev deploy + schema verification (`review_cases`, `review_events`, `reviewer_email_allowlist`)
- Playwright/browser artifacts showing either a downloadable PDF or the exact remaining failure

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS on current branch at 2026-03-06 23:11 local
- local verification: `bash scripts/agent/quality.sh` PASS after the shared text-fit, worker retry, migration hash, allowlist fallback, and renderer packaging changes
- deploy verification: dev stack is `UPDATE_COMPLETE`, renderer service is on task definition `:30`, Aurora now contains `review_cases` and `review_events`, and SSM now contains `/ai-childrens-book/dev/reviewer_email_allowlist`
- UI verification: Playwright loaded ready order `bd2165c0-15f4-4e24-b976-2cdeededd3b2` / book `f892b0ad-11e3-4310-a0c6-2f5c2b99eea3`, rendered previews, and exposed a working PDF download link; saved artifacts live under `.agent/artifacts/picture-book-hardening-01/`
- follow-up UI fix: the reader screenshot exposed two distinct web-delivery issues after the successful book run. First, API preview URLs were pointing at `/artifacts/...` while the CloudFront behavior served the artifact bucket on `/books/*`, so image requests fell through to the SPA shell. Second, the live CloudFront SPA bundle was stale and still rendered the older reader markup, so once previews started loading the intrinsic 2048px images overflowed the cards.
- follow-up evidence: `pnpm --filter @book/api test` PASS, `pnpm --filter @book/web test` PASS, `pnpm run deploy:web:dev` PASS, CloudFront now serves `/assets/index-CxtP7WeN.js` and `/assets/index-CpSJNAun.css`, Playwright reloaded the live dev UI and confirmed `.pages-grid` with `gridScrollWidth == gridClientWidth == 1296`, first `.page-card` width `244`, first image `naturalWidth 2048` but constrained `clientWidth 210`, and the fixed reader screenshot is saved at `.agent/artifacts/picture-book-hardening-01/ui-reader-previews-fixed.png`
- follow-up gap: `pnpm --filter @book/cdk test` and a fresh `bash scripts/agent/quality.sh` rerun are currently blocked by the local Docker daemon timing out during CDK lambda bundling (`docker buildx ls` => `context deadline exceeded`), so the infrastructure/script assertions were not rerun in this follow-up pass
- remaining blocker: fresh target-profile runs `c24ff2bd-9f05-4ee5-920f-017fbfabced6` (`early_decoder_5_7`) and `1e2809a5-2408-4529-a80c-3bdf13e1e243` (`read_aloud_3_4`) are still not valid pass evidence because latest `page_fill` rows fail with `fal submit failed (403): User is locked. Reason: Exhausted balance`
