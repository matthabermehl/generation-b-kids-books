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
