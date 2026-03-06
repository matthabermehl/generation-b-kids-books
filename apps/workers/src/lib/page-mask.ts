import sharp from "sharp";
import {
  expandPixelRect as expandPixelRectShared,
  normalizedRectToPixels as normalizedRectToPixelsShared,
  protectedTextRect,
  type PageCompositionSpec,
  type PixelRect
} from "@book/domain";

export type { PixelRect } from "@book/domain";

export const normalizedRectToPixels = normalizedRectToPixelsShared;
export const expandPixelRect = expandPixelRectShared;

function editableMaskSvg(
  composition: PageCompositionSpec,
  editableRect: PixelRect,
  protectedRect: PixelRect
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${composition.canvas.width}" height="${composition.canvas.height}" viewBox="0 0 ${composition.canvas.width} ${composition.canvas.height}">
    <rect width="100%" height="100%" fill="black" />
    <rect x="${editableRect.left}" y="${editableRect.top}" width="${editableRect.width}" height="${editableRect.height}" rx="48" ry="48" fill="white" />
    <rect x="${protectedRect.left}" y="${protectedRect.top}" width="${protectedRect.width}" height="${protectedRect.height}" rx="40" ry="40" fill="black" />
  </svg>`;
}

function knockoutSvg(
  composition: PageCompositionSpec,
  protectedRectPx: PixelRect,
  featherPx: number
): string {
  const blur = Math.max(8, Math.round(featherPx / 2));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${composition.canvas.width}" height="${composition.canvas.height}" viewBox="0 0 ${composition.canvas.width} ${composition.canvas.height}">
    <defs>
      <filter id="blur">
        <feGaussianBlur stdDeviation="${blur}" />
      </filter>
    </defs>
    <rect width="100%" height="100%" fill="rgba(255,255,255,0)" />
    <rect x="${protectedRectPx.left}" y="${protectedRectPx.top}" width="${protectedRectPx.width}" height="${protectedRectPx.height}" rx="40" ry="40" fill="white" filter="url(#blur)" />
  </svg>`;
}

export async function createExpandedMaskPng(composition: PageCompositionSpec): Promise<{
  bytes: Buffer;
  rect: PixelRect;
  protectedTextRect: PixelRect;
}> {
  const baseRect = normalizedRectToPixels(composition.maskBox, composition.canvas);
  const expanded = expandPixelRect(baseRect, Math.round(composition.canvas.width * 0.06), composition.canvas);
  const protectedRectPx = protectedTextRect(composition);

  return {
    bytes: await sharp(Buffer.from(editableMaskSvg(composition, expanded, protectedRectPx))).png().toBuffer(),
    rect: expanded,
    protectedTextRect: protectedRectPx
  };
}

export async function createProtectedTextKnockoutPng(
  composition: PageCompositionSpec,
  featherPx = 24
): Promise<{ bytes: Buffer; rect: PixelRect }> {
  const protectedRectPx = protectedTextRect(composition);
  return {
    bytes: await sharp(Buffer.from(knockoutSvg(composition, protectedRectPx, featherPx))).png().toBuffer(),
    rect: protectedRectPx
  };
}
