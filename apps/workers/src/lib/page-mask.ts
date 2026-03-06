import sharp from "sharp";
import type { NormalizedRect, PageCompositionSpec } from "@book/domain";

export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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

export async function createExpandedMaskPng(composition: PageCompositionSpec): Promise<{ bytes: Buffer; rect: PixelRect }> {
  const baseRect = normalizedRectToPixels(composition.maskBox, composition.canvas);
  const expanded = expandPixelRect(baseRect, Math.round(composition.canvas.width * 0.06), composition.canvas);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${composition.canvas.width}" height="${composition.canvas.height}" viewBox="0 0 ${composition.canvas.width} ${composition.canvas.height}">
    <rect width="100%" height="100%" fill="black" />
    <rect x="${expanded.left}" y="${expanded.top}" width="${expanded.width}" height="${expanded.height}" rx="48" ry="48" fill="white" />
  </svg>`;

  return {
    bytes: await sharp(Buffer.from(svg)).png().toBuffer(),
    rect: expanded
  };
}
