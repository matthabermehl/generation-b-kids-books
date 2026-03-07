# Before Branch Snapshot

## Current State
- Base branch: `codex/picture-book-fixed-layout`
- Upstream: `Github/codex/picture-book-fixed-layout`
- Baseline smoke is passing on the current head.
- The parent-facing SPA in `apps/web` still builds, but it remains a single-file React app with inline DTO types and no reviewer workflows.
- The backend already supports `needs_review` at the order/book level and persists review-relevant raw data (`images.qa_json`, `evaluations`, `book_artifacts`, picture-book image roles), but there is no internal review console, no explicit review-case model, no reviewer auth gate, and no review action API.
- Latest validated picture-book dev run can reach image generation and land in `needs_review`, so the missing operator workflow is now a real blocker.

## Objective
Implement a revitalized frontend plus internal QA/manual-review workflow in one deployable app:
- route-based parent and reviewer areas
- reviewer magic-link auth via allowlisted staff emails
- explicit review case + audit trail persistence
- reviewer queue/detail/actions (`approve_continue`, `reject`, `retry_page`)
- retry-safe current-attempt selection for images/artifacts
- stage-aware resume path after review approval

## Constraints
- Keep one frontend app, not a separate reviewer deployable.
- Preserve existing parent ordering/checkout/reader flow.
- Reuse existing email-link auth; do not add a separate auth system.
- Prefer direct, minimal architecture additions over broad framework churn.
- Keep `needs_review` parent-visible but internal-review details hidden from parents.
- Use deterministic current-attempt semantics so page retry is reliable.

## Risks
- The current API and DB model do not have explicit review-case or reviewer-role concepts, so auth/data/action changes must move together.
- Page retry touches image-worker coordination and current asset selection; partial changes would make reviewer actions unsafe.
- The frontend currently hardcodes API response shapes, so backend additions can drift unless typed-client generation is introduced.
- Approval semantics must resume the correct downstream stage rather than incorrectly forcing `ready`.

## Pending Decisions Locked For This Slice
- Reviewer UI is internal only.
- Reviewer sign-in reuses magic-link auth and is gated by SSM-configured reviewer email allowlist.
- Reviewer actions in v1 are: approve/continue, reject, retry page.
- No in-browser image/text editing in v1.

## Expected Verification
- `bash scripts/agent/test.sh`
- `bash scripts/agent/quality.sh`
- targeted web/API/worker tests for review queue/detail/actions and current-attempt selection
- dev deploy if required for live validation after implementation
