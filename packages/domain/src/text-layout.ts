import type { PageCompositionSpec } from "./types.js";

export interface TextFitResult {
  ok: boolean;
  fontPx: number;
  lines: string[];
}

export function wrapText(text: string, maxCharsPerLine: number): string[] {
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
  const boxWidth = composition.leftPage.textBox.width * composition.canvas.width;
  const boxHeight = composition.leftPage.textBox.height * composition.canvas.height;

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
