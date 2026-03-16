# Current Task
Task ID: spread-contract-proof-pdf-01

## Goal
Make picture-book spread semantics explicit and add a first-class story proof PDF so reviewers always get a readable book artifact, even before the final illustrated PDF exists.

## Constraints
- Keep `pages` rows and `story.pages[]` as spread units in this slice; no repo-wide rename.
- Keep `pdf` as the final illustrated artifact and `/download?format=pdf` final-only.
- Do not revert unrelated local changes in `.gitignore`, `apps/workers/src/providers/llm.ts`, or `apps/workers/test/llm-provider.test.ts`.

## Plan (short)
1) Persist `story.json` plus `story-proof.pdf` before story-review stops.
2) Expose the proof artifact distinctly from the final PDF in reviewer/API surfaces.
3) Clarify spread vs physical-page semantics in docs and tests.

## Evidence required
- `pnpm --filter @book/workers test`
- `pnpm --filter @book/api test`
- `pnpm --filter @book/web test`
- `bash scripts/agent/quality.sh`

## Status
- baseline: `bash scripts/agent/smoke.sh` PASS
- work: completed on `codex/spread-proof-pdf`
- verification:
  - `pnpm --filter @book/workers test` PASS
  - `pnpm --filter @book/api test` PASS
  - `pnpm --filter @book/web test` PASS
  - `bash scripts/agent/quality.sh` PASS
