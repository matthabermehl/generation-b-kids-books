# Product

## Mission
Generate personalized, visually polished children's books that teach money concepts with age-appropriate language and safe family-friendly art.

## Users
- Primary users:
  - Parents ordering personalized books for children aged `3-7`
- Secondary users:
  - Internal operators adjudicating `needs_review` books
  - Future digital storefront/export consumers

## User Outcomes
- Outcome 1:
  - Receive a personalized story with stable character art and readable page layouts.
- Outcome 2:
  - Preserve a book model that can later support print, fixed-layout ebook, and app delivery.

## Scope
### In scope
- `picture_book_fixed_layout` pipeline for `read_aloud_3_4` and `early_decoder_5_7`
- Layered page model with deterministic template selection
- Live-text PDF output and preview PNG reader assets
- Unified web app with:
  - public landing plus parent create, checkout, and current-book routes
  - internal reviewer queue and case detail console
- Tailwind + shadcn clean-product UI system for both parent and reviewer surfaces
- Manual review actions:
  - approve and continue build
  - reject book
  - retry individual image pages
- Review audit trail and deterministic current-asset selection across retries

### Out of scope
- `independent_8_10` chapter-book implementation
- Kindle/Apple export implementation
- Read-aloud audio and iPad app features in this phase

## Acceptance Sources
Primary behavioral acceptance criteria must live in `.agent/feature_list.json`.

## Reviewer Product Rules
- Reviewer UI is internal-only and gated by an allowlisted email.
- Parents never see reviewer notes or internal QA details.
- `needs_review` means the book is paused for operator adjudication, not automatically failed.
- `approve` resumes the build; it does not skip release gating.
- `retry page` is limited to image-stage review in this phase.

<!-- HARNESS-INFERRED:START -->
## Inferred Snapshot
- Repository: `ai-childrens-book`
- Runtime signals: No dominant runtime detected
- Detected package scripts: none detected
- README seed (README.md): (none detected)
- WIP summary: AI children’s book app from tech spec + market research
<!-- HARNESS-INFERRED:END -->
