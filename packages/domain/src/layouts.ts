import type { LayoutProfileId, PageTemplateId, PictureBookReadingProfile } from "./enums.js";
import { fitTextToBox, type TextFitResult } from "./text-layout.js";
import type { NormalizedRect, PageCompositionSpec } from "./types.js";

const CANVAS_SIZE = 2048;
const SPREAD_WIDTH = CANVAS_SIZE * 2;
const SAFE_MARGIN = 128;
const pictureBookTemplateId: PageTemplateId = "text_left_art_right_v1";

export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RankedPageTemplateCandidate {
  templateId: PageTemplateId;
  fit: TextFitResult;
}

const textStyles: Record<PictureBookReadingProfile, PageCompositionSpec["textStyle"]> = {
  read_aloud_3_4: {
    readingProfileId: "read_aloud_3_4",
    preferredFontPx: 82,
    minFontPx: 58,
    lineHeight: 1.18,
    align: "left"
  },
  early_decoder_5_7: {
    readingProfileId: "early_decoder_5_7",
    preferredFontPx: 68,
    minFontPx: 48,
    lineHeight: 1.22,
    align: "left"
  }
};

const baseSpreadComposition: Omit<PageCompositionSpec, "layoutProfileId" | "textStyle"> = {
  templateId: pictureBookTemplateId,
  canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
  spreadCanvas: { width: SPREAD_WIDTH, height: CANVAS_SIZE },
  leftPage: {
    textBox: { x: 0.12, y: 0.12, width: 0.76, height: 0.72 }
  },
  rightPage: {
    artBox: { x: 0.24, y: 0.20, width: 0.54, height: 0.56 },
    maskBox: { x: 0.20, y: 0.15, width: 0.62, height: 0.66 },
    fade: { shape: "ellipse", featherPx: 96 },
    gutterSafeInsetPx: 236
  }
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function pageTemplateFamily(templateId: PageTemplateId): string {
  return templateId.split("_")[0] ?? templateId;
}

export function isTallTemplate(templateId: PageTemplateId): boolean {
  return templateId.endsWith("_tall");
}

export function compositionForTemplate(
  _templateId: PageTemplateId,
  readingProfileId: PictureBookReadingProfile
): PageCompositionSpec {
  return {
    layoutProfileId: pictureBookLayoutProfileId(),
    ...baseSpreadComposition,
    textStyle: textStyles[readingProfileId]
  };
}

export function rankPageTemplateCandidates(input: {
  bookId: string;
  pageIndex: number;
  text: string;
  readingProfileId: PictureBookReadingProfile;
}): RankedPageTemplateCandidate[] {
  const composition = compositionForTemplate(pictureBookTemplateId, input.readingProfileId);
  return [
    {
      templateId: pictureBookTemplateId,
      fit: fitTextToBox(input.text, composition)
    }
  ];
}

export function selectAlternatePageTemplate(_input: {
  bookId: string;
  pageIndex: number;
  currentTemplateId: PageTemplateId;
  readingProfileId: PictureBookReadingProfile;
  text: string;
}): PageTemplateId | null {
  return null;
}

export function pictureBookLayoutProfileId(): LayoutProfileId {
  return "pb_square_spread_8_5_v1";
}

export function pictureBookCanvasSize(): number {
  return CANVAS_SIZE;
}

export function pictureBookSpreadWidth(): number {
  return SPREAD_WIDTH;
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

export function leftPageTextRect(composition: PageCompositionSpec): PixelRect {
  return normalizedRectToPixels(composition.leftPage.textBox, composition.canvas);
}

export function rightPageArtRect(composition: PageCompositionSpec): PixelRect {
  return normalizedRectToPixels(composition.rightPage.artBox, composition.canvas);
}

export function rightPageMaskRect(composition: PageCompositionSpec): PixelRect {
  return normalizedRectToPixels(composition.rightPage.maskBox, composition.canvas);
}

export function rightPageGutterSafeRect(composition: PageCompositionSpec): PixelRect {
  return {
    left: 0,
    top: 0,
    width: clamp(composition.rightPage.gutterSafeInsetPx, 1, composition.canvas.width),
    height: composition.canvas.height
  };
}

export function selectPageComposition(input: {
  bookId: string;
  pageIndex: number;
  text: string;
  readingProfileId: PictureBookReadingProfile;
  previousTemplateId?: PageTemplateId | null;
}): PageCompositionSpec {
  void input.bookId;
  void input.pageIndex;
  void input.text;
  void input.previousTemplateId;
  return compositionForTemplate(pictureBookTemplateId, input.readingProfileId);
}
