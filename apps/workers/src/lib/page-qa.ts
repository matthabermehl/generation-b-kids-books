import sharp from "sharp";
import type { PageCompositionSpec } from "@book/domain";
import { normalizedRectToPixels } from "./page-mask.js";

export interface TextFitResult {
  ok: boolean;
  fontPx: number;
  lines: string[];
}

export interface PageQaResult {
  passed: boolean;
  issues: string[];
  metrics: {
    meanLuminance: number;
    p10Luminance: number;
    edgeDensity: number;
    contrastRatio: number;
    artOccupancy: number;
    spillRatio: number;
  };
  textFit: TextFitResult;
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine || current.length === 0) {
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
    lines: wrapText(text, Math.max(10, Math.floor(boxWidth / (composition.textStyle.minFontPx * 0.52))))
  };
}

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function relativeLuminanceFromRgb(r: number, g: number, b: number): number {
  const convert = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
}

function contrastRatio(backgroundLuminance: number): number {
  const textLuminance = relativeLuminanceFromRgb(17, 24, 39);
  const lighter = Math.max(backgroundLuminance, textLuminance);
  const darker = Math.min(backgroundLuminance, textLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

async function sampleRect(buffer: Buffer, composition: PageCompositionSpec, rectKey: "textBox" | "artBox") {
  const rect = normalizedRectToPixels(composition[rectKey], composition.canvas);
  const { data, info } = await sharp(buffer)
    .extract({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return { data, info, rect };
}

export async function evaluatePictureBookPage(backgroundBytes: Buffer, composition: PageCompositionSpec, text: string): Promise<PageQaResult> {
  const issues: string[] = [];
  const textFit = fitTextToBox(text, composition);
  if (!textFit.ok) {
    issues.push("text_overflow");
  }

  const textSample = await sampleRect(backgroundBytes, composition, "textBox");
  const luminances: number[] = [];
  let edges = 0;
  let spillPixels = 0;
  for (let i = 0; i < textSample.data.length; i += textSample.info.channels) {
    const r = textSample.data[i] ?? 255;
    const g = textSample.data[i + 1] ?? 255;
    const b = textSample.data[i + 2] ?? 255;
    const lum = luminance(r, g, b);
    luminances.push(lum);
    if (lum < 0.95) {
      spillPixels += 1;
    }
    const pixelIndex = i / textSample.info.channels;
    const x = pixelIndex % textSample.info.width;
    if (x > 0) {
      const prevIndex = i - textSample.info.channels;
      const prevLum = luminance(
        textSample.data[prevIndex] ?? 255,
        textSample.data[prevIndex + 1] ?? 255,
        textSample.data[prevIndex + 2] ?? 255
      );
      if (Math.abs(lum - prevLum) > 0.08) {
        edges += 1;
      }
    }
  }

  luminances.sort((a, b) => a - b);
  const meanLuminance = luminances.reduce((sum, value) => sum + value, 0) / Math.max(luminances.length, 1);
  const p10Luminance = luminances[Math.floor(luminances.length * 0.1)] ?? meanLuminance;
  const edgeDensity = edges / Math.max(luminances.length, 1);
  const spillRatio = spillPixels / Math.max(luminances.length, 1);
  const ratio = contrastRatio(meanLuminance);

  if (meanLuminance < 0.9) {
    issues.push("text_zone_busy");
  }
  if (p10Luminance < 0.82) {
    issues.push("text_zone_low_luminance");
  }
  if (edgeDensity > 0.08) {
    issues.push("text_zone_high_edge_density");
  }
  if (ratio < 7) {
    issues.push("contrast_fail");
  }
  if (spillRatio > 0.01) {
    issues.push("text_zone_spill");
  }

  const artSample = await sampleRect(backgroundBytes, composition, "artBox");
  let occupied = 0;
  const artPixels = artSample.info.width * artSample.info.height;
  for (let i = 0; i < artSample.data.length; i += artSample.info.channels) {
    const r = artSample.data[i] ?? 255;
    const g = artSample.data[i + 1] ?? 255;
    const b = artSample.data[i + 2] ?? 255;
    if (luminance(r, g, b) < 0.97) {
      occupied += 1;
    }
  }

  const artOccupancy = occupied / Math.max(artPixels, 1);
  if (artOccupancy < 0.45) {
    issues.push("weak_art");
  }

  return {
    passed: issues.length === 0,
    issues,
    metrics: {
      meanLuminance,
      p10Luminance,
      edgeDensity,
      contrastRatio: ratio,
      artOccupancy,
      spillRatio
    },
    textFit
  };
}
