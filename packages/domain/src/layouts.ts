import type { LayoutProfileId, PageTemplateId, PictureBookReadingProfile } from "./enums.js";
import { hash32 } from "./seed.js";
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

const textStyles: Record<PictureBookReadingProfile, PageCompositionSpec["textStyle"]> = {
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
  }
};

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

export function orderedPageTemplateCandidates(
  readingProfileId: PictureBookReadingProfile,
  text: string
): PageTemplateId[] {
  const bucket = pictureBookTextBucket(text);

  if (bucket === "short") {
    return ["band_top_soft", "band_bottom_soft", "corner_ul_ellipse", "corner_ur_ellipse"];
  }

  if (bucket === "medium") {
    if (readingProfileId === "read_aloud_3_4") {
      return ["corner_ul_ellipse", "corner_ur_ellipse", "band_top_soft", "band_bottom_soft"];
    }

    return [
      "column_left_soft",
      "column_right_soft",
      "corner_ul_ellipse",
      "corner_ur_ellipse",
      "band_top_soft",
      "band_bottom_soft"
    ];
  }

  if (readingProfileId === "read_aloud_3_4") {
    return ["corner_ul_ellipse", "corner_ur_ellipse"];
  }

  return ["column_left_soft", "column_right_soft", "corner_ul_ellipse", "corner_ur_ellipse"];
}

export function compositionForTemplate(
  templateId: PageTemplateId,
  readingProfileId: PictureBookReadingProfile
): PageCompositionSpec {
  return {
    layoutProfileId: pictureBookLayoutProfileId(),
    ...baseTemplates[templateId],
    textStyle: textStyles[readingProfileId]
  };
}

export function selectAlternatePageTemplate(input: {
  currentTemplateId: PageTemplateId;
  readingProfileId: PictureBookReadingProfile;
  text: string;
}): PageTemplateId | null {
  const ordered = orderedPageTemplateCandidates(input.readingProfileId, input.text);
  const currentIndex = ordered.indexOf(input.currentTemplateId);
  const currentFamily = pageTemplateFamily(input.currentTemplateId);

  for (let step = 1; step <= ordered.length; step += 1) {
    const index = currentIndex >= 0 ? (currentIndex + step) % ordered.length : (step - 1) % ordered.length;
    const candidate = ordered[index];
    if (candidate && pageTemplateFamily(candidate) !== currentFamily) {
      return candidate;
    }
  }

  return null;
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
      return { left: 24, top: 56, right: 120, bottom: 56 };
    case "column_right_soft":
      return { left: 120, top: 56, right: 24, bottom: 56 };
    case "band_top_soft":
      return { left: 72, top: 16, right: 72, bottom: 120 };
    case "band_bottom_soft":
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
  const allowed = orderedPageTemplateCandidates(input.readingProfileId, input.text);
  if (allowed.length === 0) {
    throw new Error(`No templates available for ${input.readingProfileId}`);
  }

  const seed = hash32(`${input.bookId}:${input.pageIndex}:${input.readingProfileId}`);
  let selectedIndex = seed % allowed.length;
  let selected = allowed[selectedIndex];

  if (input.previousTemplateId && allowed.length > 1) {
    const previousFamily = pageTemplateFamily(input.previousTemplateId);
    if (pageTemplateFamily(selected) === previousFamily) {
      for (let offset = 1; offset < allowed.length; offset += 1) {
        const candidate = allowed[(selectedIndex + offset) % allowed.length];
        if (candidate && pageTemplateFamily(candidate) !== previousFamily) {
          selectedIndex = (selectedIndex + offset) % allowed.length;
          selected = candidate;
          break;
        }
      }
    }
  }

  return compositionForTemplate(selected, input.readingProfileId);
}
