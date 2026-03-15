# Review Console Runbook

## Purpose
Use the internal review console to adjudicate books that stop in `needs_review`. The console is for operator triage, not parent support.

Routes:
- `/review`
- `/review/cases/{caseId}`

## Access
1. Sign in with the normal magic-link flow.
2. The account email must be present in the SSM allowlist:
   - `/ai-childrens-book/dev/reviewer_email_allowlist`
3. Verify reviewer capability by calling:
   - `GET /v1/session`

## Decision Rules
### Approve and continue
Use when:
- the current assets are acceptable
- the blocking issue was a false positive or acceptable soft defect
- downstream rendering/finalization still needs to complete

Effect:
- writes a `review_events` row with `action=approve_continue`
- marks the case `retrying`
- resumes Step Functions from the appropriate stage

### Retry selected page
Use when:
- the book is otherwise acceptable
- one or more pages have recoverable image QA issues
- a new page image attempt is more likely to succeed than manual rejection

Effect:
- writes `review_events.action=retry_page`
- supersedes current `page_art` and `page_preview` rows for that page (and clears legacy `page` rows if present)
- re-enqueues only the selected page
- book/order return to `building` until the retry settles

Requirements:
- reviewer note is required
- only valid for image-stage review cases

### Reject book
Use when:
- the content is not acceptable to ship
- the defect is not worth retrying
- the case indicates a hard policy or product-quality violation

Effect:
- writes `review_events.action=reject`
- marks the case `rejected`
- moves book/order to terminal `failed`

Requirements:
- reviewer note is required

## How To Inspect A Case
1. Open the queue and filter by stage if needed.
2. In the case detail view, inspect:
   - stage and reason summary
   - current order/book status
   - current PDF, if available
   - page preview and final page art
   - page transcript, template id, and provenance metadata
   - current `scene-plan.json` and `image-plan.json` artifacts when continuity is relevant
   - latest QA issues and metrics
   - prior reviewer audit events
3. Cross-check any beat-planning artifacts if the case stage is `text_moderation` or `finalize_gate`.

## Evidence Expectations
Add notes that explain the operational reason for the action:
- what was wrong
- why retry vs approve vs reject was chosen
- what page(s) were affected

Good reviewer notes are short but specific. Example:
- `Retry page 4: subject clipped into text-safe zone; keep current template and regenerate art.`

## Stage Guidance
### `image_qa`
- Common issues: `text_zone_spill`, `text_zone_busy`, `text_zone_low_luminance`, `weak_art`
- Default action: retry the affected page unless the book is already visually acceptable

### `image_safety`
- Use stricter judgment
- Reject if the asset is clearly unsafe or policy-breaking
- Approve only when the safety flag is demonstrably a false positive

### `text_moderation`
- Check the final story and beat-plan report
- Reject for policy issues
- Approve when the moderation stop is clearly non-substantive

### `finalize_gate`
- Usually means downstream output or release checks blocked
- Approve to resume finalization if the assets are already acceptable

## Operational Notes
- Parent UI should only say the book is under internal review; it does not expose reviewer notes.
- `needs_review` is not a dead end. The review console is the supported resolution path.
- Always prefer page retry over rejection when the issue is isolated and recoverable.
