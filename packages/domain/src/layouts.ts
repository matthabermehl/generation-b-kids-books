import type { LayoutProfileId, PageTemplateId, PictureBookReadingProfile } from "./enums.js";
import { hash32 } from "./seed.js";
import type { PageCompositionSpec } from "./types.js";

const CANVAS_SIZE = 2048;
const SAFE_MARGIN = 128;

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
    artBox: { x: 0.40, y: 0.18, width: 0.52, height: 0.62 },
    maskBox: { x: 0.36, y: 0.14, width: 0.58, height: 0.68 },
    fade: { shape: "ellipse", featherPx: 120 }
  },
  corner_ur_ellipse: {
    templateId: "corner_ur_ellipse",
    canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
    textBox: { x: 0.58, y: 0.08, width: 0.34, height: 0.25 },
    artBox: { x: 0.08, y: 0.18, width: 0.52, height: 0.62 },
    maskBox: { x: 0.06, y: 0.14, width: 0.58, height: 0.68 },
    fade: { shape: "ellipse", featherPx: 120 }
  },
  column_left_soft: {
    templateId: "column_left_soft",
    canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
    textBox: { x: 0.08, y: 0.10, width: 0.24, height: 0.60 },
    artBox: { x: 0.30, y: 0.12, width: 0.60, height: 0.70 },
    maskBox: { x: 0.26, y: 0.10, width: 0.66, height: 0.74 },
    fade: { shape: "ellipse", featherPx: 96 }
  },
  column_right_soft: {
    templateId: "column_right_soft",
    canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
    textBox: { x: 0.68, y: 0.10, width: 0.24, height: 0.60 },
    artBox: { x: 0.10, y: 0.12, width: 0.60, height: 0.70 },
    maskBox: { x: 0.08, y: 0.10, width: 0.66, height: 0.74 },
    fade: { shape: "ellipse", featherPx: 96 }
  },
  band_top_soft: {
    templateId: "band_top_soft",
    canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
    textBox: { x: 0.10, y: 0.08, width: 0.80, height: 0.18 },
    artBox: { x: 0.12, y: 0.26, width: 0.76, height: 0.58 },
    maskBox: { x: 0.10, y: 0.22, width: 0.80, height: 0.64 },
    fade: { shape: "soft_band", featherPx: 88 }
  },
  band_bottom_soft: {
    templateId: "band_bottom_soft",
    canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
    textBox: { x: 0.10, y: 0.74, width: 0.80, height: 0.16 },
    artBox: { x: 0.12, y: 0.14, width: 0.76, height: 0.56 },
    maskBox: { x: 0.10, y: 0.12, width: 0.80, height: 0.62 },
    fade: { shape: "soft_band", featherPx: 88 }
  }
};

function textBucket(text: string): "short" | "medium" | "long" {
  const length = text.trim().length;
  if (length <= 120) {
    return "short";
  }
  if (length <= 220) {
    return "medium";
  }
  return "long";
}

function templateFamily(templateId: PageTemplateId): string {
  return templateId.split("_")[0] ?? templateId;
}

function allowedTemplates(
  readingProfileId: PictureBookReadingProfile,
  text: string
): PageTemplateId[] {
  const bucket = textBucket(text);
  const base =
    readingProfileId === "read_aloud_3_4"
      ? (["corner_ul_ellipse", "corner_ur_ellipse", "band_top_soft", "band_bottom_soft"] as PageTemplateId[])
      : ([
          "corner_ul_ellipse",
          "corner_ur_ellipse",
          "column_left_soft",
          "column_right_soft",
          "band_top_soft",
          "band_bottom_soft"
        ] as PageTemplateId[]);

  if (bucket === "short") {
    return base.filter((candidate) => candidate.startsWith("band_") || candidate.startsWith("corner_"));
  }

  if (bucket === "medium") {
    return base;
  }

  const longCandidates = base.filter((candidate) => !candidate.startsWith("band_"));
  return longCandidates.length > 0 ? longCandidates : base;
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

export function selectPageComposition(input: {
  bookId: string;
  pageIndex: number;
  text: string;
  readingProfileId: PictureBookReadingProfile;
  previousTemplateId?: PageTemplateId | null;
}): PageCompositionSpec {
  const allowed = allowedTemplates(input.readingProfileId, input.text);
  if (allowed.length === 0) {
    throw new Error(`No templates available for ${input.readingProfileId}`);
  }

  const seed = hash32(`${input.bookId}:${input.pageIndex}:${input.readingProfileId}`);
  let selected = allowed[seed % allowed.length];

  if (input.previousTemplateId && allowed.length > 1) {
    const prevFamily = templateFamily(input.previousTemplateId);
    if (templateFamily(selected) === prevFamily) {
      const alternate = allowed.find((candidate) => templateFamily(candidate) !== prevFamily);
      if (alternate) {
        selected = alternate;
      }
    }
  }

  return {
    layoutProfileId: pictureBookLayoutProfileId(),
    ...baseTemplates[selected],
    textStyle: textStyles[input.readingProfileId]
  };
}
