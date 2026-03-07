import type { LayoutProfileId, PageTemplateId, PictureBookReadingProfile } from "./enums.js";
import { hash32 } from "./seed.js";
import { fitTextToBox, type TextFitResult } from "./text-layout.js";
import type { NormalizedRect, PageCompositionSpec } from "./types.js";

const CANVAS_SIZE = 2048;
const SAFE_MARGIN = 128;

export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DirectionalOverflowInsets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type PictureBookTextBucket = "short" | "medium" | "long";

const baseTextStyles: Record<PictureBookReadingProfile, PageCompositionSpec["textStyle"]> = {
  read_aloud_3_4: {
    readingProfileId: "read_aloud_3_4",
    preferredFontPx: 78,
    minFontPx: 62,
    lineHeight: 1.18,
    align: "left"
  },
  early_decoder_5_7: {
    readingProfileId: "early_decoder_5_7",
    preferredFontPx: 64,
    minFontPx: 52,
    lineHeight: 1.24,
    align: "left"
  }
};

const tallTextStyles: Record<PictureBookReadingProfile, PageCompositionSpec["textStyle"]> = {
  read_aloud_3_4: {
    readingProfileId: "read_aloud_3_4",
    preferredFontPx: 74,
    minFontPx: 54,
    lineHeight: 1.18,
    align: "left"
  },
  early_decoder_5_7: {
    readingProfileId: "early_decoder_5_7",
    preferredFontPx: 60,
    minFontPx: 46,
    lineHeight: 1.24,
    align: "left"
  }
};

const baseTemplates: Record<PageTemplateId, Omit<PageCompositionSpec, "layoutProfileId" | "textStyle">> = {
  corner_ul_ellipse: {
    templateId: "corner_ul_ellipse",
    canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
    textBox: { x: 0.08, y: 0.08, width: 0.34, height: 0.25 },
    artBox: { x: 0.44, y: 0.22, width: 0.48, height: 0.56 },
    maskBox: { x: 0.42, y: 0.18, width: 0.52, height: 0.62 },
    fade: { shape: "ellipse", featherPx: 120 }
  },
  corner_ur_ellipse: {
    templateId: "corner_ur_ellipse",
    canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
    textBox: { x: 0.58, y: 0.08, width: 0.34, height: 0.25 },
    artBox: { x: 0.08, y: 0.22, width: 0.48, height: 0.56 },
    maskBox: { x: 0.06, y: 0.18, width: 0.52, height: 0.62 },
    fade: { shape: "ellipse", featherPx: 120 }
  },
  column_left_soft: {
    templateId: "column_left_soft",
    canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
    textBox: { x: 0.08, y: 0.10, width: 0.24, height: 0.60 },
    artBox: { x: 0.36, y: 0.12, width: 0.52, height: 0.70 },
    maskBox: { x: 0.32, y: 0.10, width: 0.56, height: 0.74 },
    fade: { shape: "ellipse", featherPx: 96 }
  },
  column_right_soft: {
    templateId: "column_right_soft",
    canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
    textBox: { x: 0.68, y: 0.10, width: 0.24, height: 0.60 },
    artBox: { x: 0.12, y: 0.12, width: 0.52, height: 0.70 },
    maskBox: { x: 0.12, y: 0.10, width: 0.56, height: 0.74 },
    fade: { shape: "ellipse", featherPx: 96 }
  },
  column_left_tall: {
    templateId: "column_left_tall",
    canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
    textBox: { x: 0.07, y: 0.08, width: 0.30, height: 0.72 },
    artBox: { x: 0.40, y: 0.16, width: 0.48, height: 0.64 },
    maskBox: { x: 0.36, y: 0.12, width: 0.54, height: 0.70 },
    fade: { shape: "ellipse", featherPx: 96 }
  },
  column_right_tall: {
    templateId: "column_right_tall",
    canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
    textBox: { x: 0.63, y: 0.08, width: 0.30, height: 0.72 },
    artBox: { x: 0.12, y: 0.16, width: 0.48, height: 0.64 },
    maskBox: { x: 0.10, y: 0.12, width: 0.54, height: 0.70 },
    fade: { shape: "ellipse", featherPx: 96 }
  },
  band_top_soft: {
    templateId: "band_top_soft",
    canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
    textBox: { x: 0.10, y: 0.08, width: 0.80, height: 0.18 },
    artBox: { x: 0.12, y: 0.30, width: 0.76, height: 0.52 },
    maskBox: { x: 0.10, y: 0.28, width: 0.80, height: 0.56 },
    fade: { shape: "soft_band", featherPx: 88 }
  },
  band_bottom_soft: {
    templateId: "band_bottom_soft",
    canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
    textBox: { x: 0.10, y: 0.74, width: 0.80, height: 0.16 },
    artBox: { x: 0.12, y: 0.18, width: 0.76, height: 0.50 },
    maskBox: { x: 0.10, y: 0.16, width: 0.80, height: 0.56 },
    fade: { shape: "soft_band", featherPx: 88 }
  },
  band_top_tall: {
    templateId: "band_top_tall",
    canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
    textBox: { x: 0.08, y: 0.06, width: 0.84, height: 0.24 },
    artBox: { x: 0.12, y: 0.34, width: 0.76, height: 0.42 },
    maskBox: { x: 0.10, y: 0.30, width: 0.80, height: 0.50 },
    fade: { shape: "soft_band", featherPx: 88 }
  },
  band_bottom_tall: {
    templateId: "band_bottom_tall",
    canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
    textBox: { x: 0.08, y: 0.70, width: 0.84, height: 0.24 },
    artBox: { x: 0.12, y: 0.24, width: 0.76, height: 0.42 },
    maskBox: { x: 0.10, y: 0.20, width: 0.80, height: 0.50 },
    fade: { shape: "soft_band", featherPx: 88 }
  }
};

export interface RankedPageTemplateCandidate {
  templateId: PageTemplateId;
  fit: TextFitResult;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function pictureBookTextBucket(text: string): PictureBookTextBucket {
  const length = text.trim().length;
  if (length <= 120) {
    return "short";
  }
  if (length <= 220) {
    return "medium";
  }
  return "long";
}

export function pageTemplateFamily(templateId: PageTemplateId): string {
  return templateId.split("_")[0] ?? templateId;
}

export function isTallTemplate(templateId: PageTemplateId): boolean {
  return templateId.endsWith("_tall");
}

export function orderedPageTemplateCandidates(
  readingProfileId: PictureBookReadingProfile,
  text: string
): PageTemplateId[] {
  const bucket = pictureBookTextBucket(text);

  if (bucket === "short") {
    if (readingProfileId === "read_aloud_3_4") {
      return ["band_top_soft", "band_bottom_soft", "corner_ul_ellipse", "corner_ur_ellipse"];
    }

    return ["band_top_soft", "band_bottom_soft", "column_left_soft", "column_right_soft"];
  }

  if (bucket === "medium") {
    if (readingProfileId === "read_aloud_3_4") {
      return [
        "band_top_tall",
        "band_bottom_tall",
        "band_top_soft",
        "band_bottom_soft",
        "column_left_tall",
        "column_right_tall",
        "corner_ul_ellipse",
        "corner_ur_ellipse"
      ];
    }

    return [
      "column_left_tall",
      "column_right_tall",
      "column_left_soft",
      "column_right_soft",
      "band_top_tall",
      "band_bottom_tall",
      "band_top_soft",
      "band_bottom_soft",
      "corner_ul_ellipse",
      "corner_ur_ellipse"
    ];
  }

  if (readingProfileId === "read_aloud_3_4") {
    return [
      "band_top_tall",
      "band_bottom_tall",
      "column_left_tall",
      "column_right_tall",
      "band_top_soft",
      "band_bottom_soft"
    ];
  }

  return [
    "column_left_tall",
    "column_right_tall",
    "band_top_tall",
    "band_bottom_tall",
    "column_left_soft",
    "column_right_soft",
    "band_top_soft",
    "band_bottom_soft"
  ];
}

function groupTemplatesByFamily(templateIds: PageTemplateId[]): PageTemplateId[][] {
  const groups: PageTemplateId[][] = [];

  for (const templateId of templateIds) {
    const currentFamily = pageTemplateFamily(templateId);
    const lastGroup = groups.at(-1);
    const lastFamily = lastGroup?.[0] ? pageTemplateFamily(lastGroup[0]) : null;
    if (!lastGroup || lastFamily !== currentFamily) {
      groups.push([templateId]);
      continue;
    }

    lastGroup.push(templateId);
  }

  return groups;
}

function rotateCandidates<T>(candidates: T[], seed: number): T[] {
  if (candidates.length <= 1) {
    return candidates;
  }

  const offset = seed % candidates.length;
  if (offset === 0) {
    return candidates;
  }

  return [...candidates.slice(offset), ...candidates.slice(0, offset)];
}

export function rankPageTemplateCandidates(input: {
  bookId: string;
  pageIndex: number;
  text: string;
  readingProfileId: PictureBookReadingProfile;
}): RankedPageTemplateCandidate[] {
  const ordered = orderedPageTemplateCandidates(input.readingProfileId, input.text);
  const groupSeedBase = hash32(`${input.bookId}:${input.pageIndex}:${input.readingProfileId}`);

  return groupTemplatesByFamily(ordered).flatMap((group, groupIndex) => {
    const entries = group.map((templateId) => ({
      templateId,
      fit: fitTextToBox(input.text, compositionForTemplate(templateId, input.readingProfileId))
    }));
    const fitEntries = entries.filter((entry) => entry.fit.ok);
    const groupSeed = hash32(`${groupSeedBase}:${groupIndex}:${group[0] ?? "none"}`);

    if (fitEntries.length > 0) {
      const overflowEntries = entries.filter((entry) => !entry.fit.ok);
      return [...rotateCandidates(fitEntries, groupSeed), ...overflowEntries];
    }

    return rotateCandidates(entries, groupSeed);
  });
}

function textStyleForTemplate(
  templateId: PageTemplateId,
  readingProfileId: PictureBookReadingProfile
): PageCompositionSpec["textStyle"] {
  return isTallTemplate(templateId) ? tallTextStyles[readingProfileId] : baseTextStyles[readingProfileId];
}

export function compositionForTemplate(
  templateId: PageTemplateId,
  readingProfileId: PictureBookReadingProfile
): PageCompositionSpec {
  return {
    layoutProfileId: pictureBookLayoutProfileId(),
    ...baseTemplates[templateId],
    textStyle: textStyleForTemplate(templateId, readingProfileId)
  };
}

export function selectAlternatePageTemplate(input: {
  bookId: string;
  pageIndex: number;
  currentTemplateId: PageTemplateId;
  readingProfileId: PictureBookReadingProfile;
  text: string;
}): PageTemplateId | null {
  const ranked = rankPageTemplateCandidates(input).map((entry) => entry.templateId);
  const currentIndex = ranked.indexOf(input.currentTemplateId);

  if (currentIndex < 0) {
    return ranked[0] ?? null;
  }

  return ranked[currentIndex + 1] ?? null;
}

export function pictureBookLayoutProfileId(): LayoutProfileId {
  return "pb_square_8_5_v1";
}

export function pictureBookCanvasSize(): number {
  return CANVAS_SIZE;
}

export function pictureBookSafeMargin(): number {
  return SAFE_MARGIN;
}

export function normalizedRectToPixels(rect: NormalizedRect, canvas: { width: number; height: number }): PixelRect {
  const left = Math.round(rect.x * canvas.width);
  const top = Math.round(rect.y * canvas.height);
  const width = Math.round(rect.width * canvas.width);
  const height = Math.round(rect.height * canvas.height);

  return {
    left: clamp(left, 0, canvas.width - 1),
    top: clamp(top, 0, canvas.height - 1),
    width: clamp(width, 1, canvas.width - left),
    height: clamp(height, 1, canvas.height - top)
  };
}

export function expandPixelRect(rect: PixelRect, expansionPx: number, canvas: { width: number; height: number }): PixelRect {
  const left = clamp(rect.left - expansionPx, 0, canvas.width - 1);
  const top = clamp(rect.top - expansionPx, 0, canvas.height - 1);
  const right = clamp(rect.left + rect.width + expansionPx, 1, canvas.width);
  const bottom = clamp(rect.top + rect.height + expansionPx, 1, canvas.height);

  return {
    left,
    top,
    width: clamp(right - left, 1, canvas.width - left),
    height: clamp(bottom - top, 1, canvas.height - top)
  };
}

export function insetPixelRect(rect: PixelRect, insetPx: number, canvas: { width: number; height: number }): PixelRect {
  const safeInsetX = Math.min(insetPx, Math.floor((rect.width - 1) / 2));
  const safeInsetY = Math.min(insetPx, Math.floor((rect.height - 1) / 2));
  const left = clamp(rect.left + safeInsetX, 0, canvas.width - 1);
  const top = clamp(rect.top + safeInsetY, 0, canvas.height - 1);
  const right = clamp(rect.left + rect.width - safeInsetX, left + 1, canvas.width);
  const bottom = clamp(rect.top + rect.height - safeInsetY, top + 1, canvas.height);

  return {
    left,
    top,
    width: clamp(right - left, 1, canvas.width - left),
    height: clamp(bottom - top, 1, canvas.height - top)
  };
}

export function protectedTextExpansionPx(templateId: PageTemplateId): number {
  return templateId.startsWith("band_") ? 56 : 72;
}

export function protectedTextRect(composition: PageCompositionSpec): PixelRect {
  const textRect = normalizedRectToPixels(composition.textBox, composition.canvas);
  return expandPixelRect(textRect, protectedTextExpansionPx(composition.templateId), composition.canvas);
}

export function directionalArtOverflow(templateId: PageTemplateId): DirectionalOverflowInsets {
  switch (templateId) {
    case "corner_ul_ellipse":
      return { left: 24, top: 24, right: 120, bottom: 120 };
    case "corner_ur_ellipse":
      return { left: 120, top: 24, right: 24, bottom: 120 };
    case "column_left_soft":
    case "column_left_tall":
      return { left: 24, top: 56, right: 120, bottom: 56 };
    case "column_right_soft":
    case "column_right_tall":
      return { left: 120, top: 56, right: 24, bottom: 56 };
    case "band_top_soft":
    case "band_top_tall":
      return { left: 72, top: 16, right: 72, bottom: 120 };
    case "band_bottom_soft":
    case "band_bottom_tall":
      return { left: 72, top: 120, right: 72, bottom: 16 };
  }
}

export function selectPageComposition(input: {
  bookId: string;
  pageIndex: number;
  text: string;
  readingProfileId: PictureBookReadingProfile;
  previousTemplateId?: PageTemplateId | null;
}): PageCompositionSpec {
  const ranked = rankPageTemplateCandidates(input);
  if (ranked.length === 0) {
    throw new Error(`No templates available for ${input.readingProfileId}`);
  }

  const fitCandidates = ranked.filter((entry) => entry.fit.ok);
  const allowed = fitCandidates.length > 0 ? fitCandidates : ranked;
  let selected = allowed[0]?.templateId;

  if (input.previousTemplateId && allowed.length > 1 && selected) {
    const previousFamily = pageTemplateFamily(input.previousTemplateId);
    if (pageTemplateFamily(selected) === previousFamily) {
      for (const candidate of allowed) {
        if (candidate && pageTemplateFamily(candidate.templateId) !== previousFamily) {
          selected = candidate.templateId;
          break;
        }
      }
    }
  }

  if (!selected) {
    throw new Error(`Unable to resolve page template for ${input.readingProfileId}`);
  }

  return compositionForTemplate(selected, input.readingProfileId);
}
