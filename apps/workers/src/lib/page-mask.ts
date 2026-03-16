import sharp from "sharp";
import {
  expandPixelRect as expandPixelRectShared,
  normalizedRectToPixels as normalizedRectToPixelsShared,
  rightPageGutterSafeRect,
  rightPageMaskRect,
  type PageCompositionSpec,
  type PixelRect
} from "@book/domain";

export type { PixelRect } from "@book/domain";

export const normalizedRectToPixels = normalizedRectToPixelsShared;
export const expandPixelRect = expandPixelRectShared;

function editableMaskSvg(composition: PageCompositionSpec, editableRect: PixelRect): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${composition.canvas.width}" height="${composition.canvas.height}" viewBox="0 0 ${composition.canvas.width} ${composition.canvas.height}">
    <rect width="100%" height="100%" fill="black" />
    <rect x="${editableRect.left}" y="${editableRect.top}" width="${editableRect.width}" height="${editableRect.height}" rx="56" ry="56" fill="white" />
  </svg>`;
}

export async function createExpandedMaskPng(composition: PageCompositionSpec): Promise<{
  bytes: Buffer;
  rect: PixelRect;
  gutterSafeRect: PixelRect;
}> {
  const baseRect = rightPageMaskRect(composition);
  const expanded = expandPixelRect(baseRect, Math.round(composition.canvas.width * 0.04), composition.canvas);
  const gutterSafeRect = rightPageGutterSafeRect(composition);

  return {
    bytes: await sharp(Buffer.from(editableMaskSvg(composition, expanded))).png().toBuffer(),
    rect: expanded,
    gutterSafeRect
  };
}
