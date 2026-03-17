import sharp from "sharp";
import {
  fitTextToBox,
  insetPixelRect,
  rightPageArtRect,
  rightPageGutterSafeRect,
  type PageCompositionSpec,
  type TextFitResult
} from "@book/domain";

export interface PageQaResult {
  passed: boolean;
  issues: string[];
  metrics: {
    gutterMeanLuminance: number;
    gutterP10Luminance: number;
    gutterEdgeDensity: number;
    gutterOccupancyRatio: number;
    artOccupancy: number;
  };
  textFit: TextFitResult;
}

export type PictureBookQaCategory =
  | "text_layout"
  | "gutter_safety"
  | "art_strength"
  | "provider_timeout"
  | "safety"
  | "other";

const textLayoutIssues = new Set(["text_overflow"]);
const gutterSafetyIssues = new Set(["gutter_intrusion", "gutter_low_luminance", "gutter_high_edge_density"]);
export { fitTextToBox };

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

async function sampleRect(buffer: Buffer, rect: { left: number; top: number; width: number; height: number }) {
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
  if (issues.some((issue) => textLayoutIssues.has(issue))) {
    return "text_layout";
  }
  if (issues.some((issue) => gutterSafetyIssues.has(issue))) {
    return "gutter_safety";
  }
  if (issues.some((issue) => issue === "provider_timeout" || issue.toLowerCase().includes("timed out"))) {
    return "provider_timeout";
  }
  if (issues.some((issue) => issue.startsWith("visual_qa:"))) {
    return "art_strength";
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

  const gutterRect = insetPixelRect(rightPageGutterSafeRect(composition), 24, composition.canvas);
  const gutterSample = await sampleRect(backgroundBytes, gutterRect);

  const luminances: number[] = [];
  let occupiedPixels = 0;
  let edges = 0;
  const gutterPixels = Math.max(gutterSample.info.width * gutterSample.info.height, 1);

  for (let i = 0; i < gutterSample.data.length; i += gutterSample.info.channels) {
    const r = gutterSample.data[i] ?? 255;
    const g = gutterSample.data[i + 1] ?? 255;
    const b = gutterSample.data[i + 2] ?? 255;
    const lum = luminance(r, g, b);
    luminances.push(lum);
    if (lum < 0.97) {
      occupiedPixels += 1;
    }

    const pixelIndex = i / gutterSample.info.channels;
    const x = pixelIndex % gutterSample.info.width;
    if (x > 0) {
      const prevIndex = i - gutterSample.info.channels;
      const prevLum = luminance(
        gutterSample.data[prevIndex] ?? 255,
        gutterSample.data[prevIndex + 1] ?? 255,
        gutterSample.data[prevIndex + 2] ?? 255
      );
      if (Math.abs(lum - prevLum) > 0.05) {
        edges += 1;
      }
    }
  }

  luminances.sort((a, b) => a - b);
  const gutterMeanLuminance = luminances.reduce((sum, value) => sum + value, 0) / Math.max(luminances.length, 1);
  const gutterP10Luminance = luminances[Math.floor(luminances.length * 0.1)] ?? gutterMeanLuminance;
  const gutterEdgeDensity = edges / gutterPixels;
  const gutterOccupancyRatio = occupiedPixels / gutterPixels;

  if (gutterP10Luminance < 0.94) {
    issues.push("gutter_low_luminance");
  }
  if (gutterEdgeDensity > 0.03) {
    issues.push("gutter_high_edge_density");
  }
  if (gutterOccupancyRatio > 0.015) {
    issues.push("gutter_intrusion");
  }

  const artRect = rightPageArtRect(composition);
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
  if (artOccupancy < 0.32) {
    issues.push("weak_art");
  }

  return {
    passed: issues.length === 0,
    issues,
    metrics: {
      gutterMeanLuminance,
      gutterP10Luminance,
      gutterEdgeDensity,
      gutterOccupancyRatio,
      artOccupancy
    },
    textFit
  };
}
