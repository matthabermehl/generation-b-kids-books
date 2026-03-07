import sharp from "sharp";
import {
  fitTextToBox,
  insetPixelRect,
  normalizedRectToPixels,
  type PageCompositionSpec,
  type PixelRect,
  type TextFitResult
} from "@book/domain";

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

export type PictureBookQaCategory = "text_zone" | "art_strength" | "provider_timeout" | "safety" | "other";

const textZoneIssues = new Set([
  "text_zone_spill",
  "text_zone_busy",
  "text_zone_low_luminance",
  "text_zone_high_edge_density",
  "contrast_fail",
  "text_overflow"
]);
export { fitTextToBox };

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

async function sampleRect(buffer: Buffer, rect: PixelRect) {
  const { data, info } = await sharp(buffer)
    .extract({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return { data, info, rect };
}

export function classifyPictureBookIssues(issues: string[]): PictureBookQaCategory {
  if (issues.some((issue) => issue.startsWith("safety_flagged_prompt:"))) {
    return "safety";
  }
  if (issues.some((issue) => textZoneIssues.has(issue))) {
    return "text_zone";
  }
  if (issues.some((issue) => issue === "provider_timeout" || issue.includes("fal poll timed out"))) {
    return "provider_timeout";
  }
  if (issues.some((issue) => issue === "weak_art")) {
    return "art_strength";
  }
  return "other";
}

export async function evaluatePictureBookPage(
  backgroundBytes: Buffer,
  composition: PageCompositionSpec,
  text: string
): Promise<PageQaResult> {
  const issues: string[] = [];
  const textFit = fitTextToBox(text, composition);
  if (!textFit.ok) {
    issues.push("text_overflow");
  }

  const textRect = normalizedRectToPixels(composition.textBox, composition.canvas);
  const innerTextRect = insetPixelRect(textRect, 48, composition.canvas);
  const luminanceSample = await sampleRect(backgroundBytes, innerTextRect);
  const edgeSample = await sampleRect(backgroundBytes, textRect);

  const luminances: number[] = [];
  let spillPixels = 0;
  for (let i = 0; i < luminanceSample.data.length; i += luminanceSample.info.channels) {
    const r = luminanceSample.data[i] ?? 255;
    const g = luminanceSample.data[i + 1] ?? 255;
    const b = luminanceSample.data[i + 2] ?? 255;
    const lum = luminance(r, g, b);
    luminances.push(lum);
    if (lum < 0.94) {
      spillPixels += 1;
    }
  }

  let edges = 0;
  const edgeLuminancesCount = Math.max(edgeSample.info.width * edgeSample.info.height, 1);
  for (let i = 0; i < edgeSample.data.length; i += edgeSample.info.channels) {
    const r = edgeSample.data[i] ?? 255;
    const g = edgeSample.data[i + 1] ?? 255;
    const b = edgeSample.data[i + 2] ?? 255;
    const lum = luminance(r, g, b);
    const pixelIndex = i / edgeSample.info.channels;
    const x = pixelIndex % edgeSample.info.width;
    if (x > 0) {
      const prevIndex = i - edgeSample.info.channels;
      const prevLum = luminance(
        edgeSample.data[prevIndex] ?? 255,
        edgeSample.data[prevIndex + 1] ?? 255,
        edgeSample.data[prevIndex + 2] ?? 255
      );
      if (Math.abs(lum - prevLum) > 0.08) {
        edges += 1;
      }
    }
  }

  luminances.sort((a, b) => a - b);
  const meanLuminance = luminances.reduce((sum, value) => sum + value, 0) / Math.max(luminances.length, 1);
  const p10Luminance = luminances[Math.floor(luminances.length * 0.1)] ?? meanLuminance;
  const edgeDensity = edges / edgeLuminancesCount;
  const spillRatio = spillPixels / Math.max(luminances.length, 1);
  const ratio = contrastRatio(meanLuminance);

  if (meanLuminance < 0.9) {
    issues.push("text_zone_busy");
  }
  if (p10Luminance < 0.82) {
    issues.push("text_zone_low_luminance");
  }
  if (edgeDensity > 0.1) {
    issues.push("text_zone_high_edge_density");
  }
  if (ratio < 7) {
    issues.push("contrast_fail");
  }
  if (spillRatio > 0.02) {
    issues.push("text_zone_spill");
  }

  const artRect = normalizedRectToPixels(composition.artBox, composition.canvas);
  const artSample = await sampleRect(backgroundBytes, artRect);
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
  if (artOccupancy < 0.4) {
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
