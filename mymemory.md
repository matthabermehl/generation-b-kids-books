# Session Memory

## OpenAI image pipeline cutover
- Branch: `codex/openai-image-pipeline`
- Goal: replace the Fal/Kontext/Fill image stack with an OpenAI `gpt-image-1.5` workflow and make character approval a required pre-checkout step.
- Keep: deterministic square composition, fade/knockout rendering, preview/PDF generation, QA/review flow.
- Remove decisively: `scene_plate`, `page_fill`, Fal runtime config, style-board/paper-texture provider conditioning, and old review payload naming.
- New image roles:
  - `character_candidate`
  - `character_reference`
  - `page_art`
  - `page_preview`
- New planning metadata:
  - `sceneId`
  - `sceneVisualDescription`
  - `scene-plan.json`
  - `image-plan.json`
- Character approval happens before checkout, is book-scoped, and is capped at 10 generated candidates per book.
