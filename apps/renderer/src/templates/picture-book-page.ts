import sharp from "sharp";
import { rendererFonts } from "./fonts.js";

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageCompositionSpec {
  layoutProfileId: "pb_square_8_5_v1";
  templateId:
    | "corner_ul_ellipse"
    | "corner_ur_ellipse"
    | "column_left_soft"
    | "column_right_soft"
    | "band_top_soft"
    | "band_bottom_soft";
  canvas: { width: number; height: number };
  textBox: NormalizedRect;
  artBox: NormalizedRect;
  maskBox: NormalizedRect;
  fade: { shape: "ellipse" | "soft_band"; featherPx: number };
  textStyle: {
    readingProfileId: "read_aloud_3_4" | "early_decoder_5_7";
    preferredFontPx: number;
    minFontPx: number;
    lineHeight: number;
    align: "left";
  };
}

export interface TextFitResult {
  ok: boolean;
  fontPx: number;
  lines: string[];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rectToPixels(rect: NormalizedRect, canvas: { width: number; height: number }) {
  return {
    left: Math.round(rect.x * canvas.width),
    top: Math.round(rect.y * canvas.height),
    width: Math.round(rect.width * canvas.width),
    height: Math.round(rect.height * canvas.height)
  };
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

export function fitTextToBox(text: string, composition: PageCompositionSpec): TextFitResult {
  const boxWidth = composition.textBox.width * composition.canvas.width;
  const boxHeight = composition.textBox.height * composition.canvas.height;

  for (let fontPx = composition.textStyle.preferredFontPx; fontPx >= composition.textStyle.minFontPx; fontPx -= 2) {
    const avgCharWidth = fontPx * 0.52;
    const maxCharsPerLine = Math.max(10, Math.floor(boxWidth / avgCharWidth));
    const lines = wrapText(text, maxCharsPerLine);
    const totalHeight = lines.length * fontPx * composition.textStyle.lineHeight;
    if (totalHeight <= boxHeight) {
      return { ok: true, fontPx, lines };
    }
  }

  return {
    ok: false,
    fontPx: composition.textStyle.minFontPx,
    lines: wrapText(text, 18)
  };
}

function fadeMaskSvg(composition: PageCompositionSpec): string {
  const rect = rectToPixels(composition.maskBox, composition.canvas);
  const blur = Math.max(8, Math.round(composition.fade.featherPx / 2));
  if (composition.fade.shape === "soft_band") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${composition.canvas.width}" height="${composition.canvas.height}" viewBox="0 0 ${composition.canvas.width} ${composition.canvas.height}">
      <defs><filter id="blur"><feGaussianBlur stdDeviation="${blur}" /></filter></defs>
      <rect width="100%" height="100%" fill="black" />
      <rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" rx="72" ry="72" fill="white" filter="url(#blur)" />
    </svg>`;
  }

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${composition.canvas.width}" height="${composition.canvas.height}" viewBox="0 0 ${composition.canvas.width} ${composition.canvas.height}">
    <defs><filter id="blur"><feGaussianBlur stdDeviation="${blur}" /></filter></defs>
    <rect width="100%" height="100%" fill="black" />
    <ellipse cx="${cx}" cy="${cy}" rx="${rect.width / 2}" ry="${rect.height / 2}" fill="white" filter="url(#blur)" />
  </svg>`;
}

export async function buildArtBackground(artBytes: Buffer, composition: PageCompositionSpec): Promise<Buffer> {
  const mask = await sharp(Buffer.from(fadeMaskSvg(composition))).png().toBuffer();
  const normalizedArt = await sharp(artBytes)
    .resize({
      width: composition.canvas.width,
      height: composition.canvas.height,
      fit: "cover"
    })
    .ensureAlpha()
    .png()
    .toBuffer();
  const masked = await sharp(normalizedArt).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  return sharp({
    create: {
      width: composition.canvas.width,
      height: composition.canvas.height,
      channels: 4,
      background: "#ffffff"
    }
  })
    .composite([{ input: masked, blend: "over" }])
    .png()
    .toBuffer();
}

function buildTextOverlaySvg(text: string, composition: PageCompositionSpec, fit: TextFitResult): string {
  const rect = rectToPixels(composition.textBox, composition.canvas);
  const lineHeightPx = fit.fontPx * composition.textStyle.lineHeight;
  const tspans = fit.lines
    .map((line, index) => {
      const y = rect.top + fit.fontPx + index * lineHeightPx;
      return `<text x="${rect.left}" y="${y}" font-family="${rendererFonts.bodySvg}" font-size="${fit.fontPx}" fill="#111827">${escapeXml(line)}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${composition.canvas.width}" height="${composition.canvas.height}" viewBox="0 0 ${composition.canvas.width} ${composition.canvas.height}">
    ${tspans}
  </svg>`;
}

export async function renderPictureBookPreview(input: {
  artBytes: Buffer;
  text: string;
  composition: PageCompositionSpec;
}): Promise<{ previewPng: Buffer; artBackgroundPng: Buffer; textFit: TextFitResult }> {
  const artBackgroundPng = await buildArtBackground(input.artBytes, input.composition);
  const textFit = fitTextToBox(input.text, input.composition);
  const previewPng = await sharp(artBackgroundPng)
    .composite([{ input: Buffer.from(buildTextOverlaySvg(input.text, input.composition, textFit)), blend: "over" }])
    .png()
    .toBuffer();

  return { previewPng, artBackgroundPng, textFit };
}
