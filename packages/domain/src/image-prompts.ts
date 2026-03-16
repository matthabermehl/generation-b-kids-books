export const maxCharacterGenerationsPerBook = 10;

export const watercolorStyleGuide = [
  "Detailed children's book watercolor illustration on bright white paper.",
  "Layered hand-painted washes, visible pigment blooms, soft pencil-and-ink edges, and artful brush texture.",
  "Warm, observant, emotionally grounded, and richly illustrated rather than flat or cartoony."
].join(" ");

function cleanPromptSection(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildCharacterCandidatePrompt(characterDescription: string): string {
  const normalizedDescription = cleanPromptSection(characterDescription);

  return [
    "Character:",
    normalizedDescription,
    "",
    "Composition:",
    "Create a single full-body character portrait with generous breathing room around the silhouette. Keep the background plain white or a barely-there wash so the character is easy to isolate and reuse later.",
    "",
    "Style:",
    watercolorStyleGuide,
    "",
    "Constraints:",
    "No text, no lettering, no watermarks, no logos, and no frame. Keep the character centered and fully visible."
  ].join("\n");
}

export function buildPageArtPrompt(input: {
  pageText: string;
  illustrationBrief: string;
  sceneVisualDescription: string;
}): string {
  const illustrationBrief = cleanPromptSection(input.illustrationBrief);
  const pageText = cleanPromptSection(input.pageText);
  const sceneVisualDescription = cleanPromptSection(input.sceneVisualDescription);

  return [
    "Task:",
    "Edit the masked watercolor region so it becomes the finished illustration for the right-hand page of a facing spread.",
    "",
    "Scene continuity:",
    sceneVisualDescription,
    "",
    "Page moment:",
    illustrationBrief,
    "",
    "Reading text for context only:",
    pageText,
    "",
    "Style:",
    watercolorStyleGuide,
    "",
    "Layout intent:",
    "This spread uses a text-only left page and an illustration-only right page.",
    "Keep generous white paper margins around the painted area.",
    "Keep the subject and important props away from the inner gutter side of the right page.",
    "",
    "Constraints:",
    "Match the approved character reference and any same-scene reference images for costume, proportions, palette, props, and camera continuity.",
    "Paint only inside the editable masked watercolor region on the right page.",
    "Keep all white paper, margins, gutter space, and negative space outside the mask untouched.",
    "No text, no lettering, no captions, no page numbers, no logos, and no watermarks anywhere in the image."
  ].join("\n");
}
