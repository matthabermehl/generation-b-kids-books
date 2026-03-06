import sharp from "sharp";
import { directionalArtOverflow, type PageCompositionSpec, type PixelRect } from "@book/domain";
import { createProtectedTextKnockoutPng, normalizedRectToPixels } from "./page-mask.js";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function resolvePlacedArtRect(composition: PageCompositionSpec): PixelRect {
  const artRect = normalizedRectToPixels(composition.artBox, composition.canvas);
  const overflow = directionalArtOverflow(composition.templateId);
  const left = clamp(artRect.left - overflow.left, 0, composition.canvas.width - 1);
  const top = clamp(artRect.top - overflow.top, 0, composition.canvas.height - 1);
  const right = clamp(artRect.left + artRect.width + overflow.right, left + 1, composition.canvas.width);
  const bottom = clamp(artRect.top + artRect.height + overflow.bottom, top + 1, composition.canvas.height);

  return {
    left,
    top,
    width: clamp(right - left, 1, composition.canvas.width - left),
    height: clamp(bottom - top, 1, composition.canvas.height - top)
  };
}

export async function createPlacedPageCanvas(sceneBytes: Buffer, composition: PageCompositionSpec): Promise<Buffer> {
  const placementRect = resolvePlacedArtRect(composition);
  const sceneLayer = await sharp(sceneBytes)
    .resize({ width: placementRect.width, height: placementRect.height, fit: "cover" })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: composition.canvas.width,
      height: composition.canvas.height,
      channels: 4,
      background: "#ffffff"
    }
  })
    .composite([{ input: sceneLayer, left: placementRect.left, top: placementRect.top }])
    .png()
    .toBuffer();
}

function fadeMaskSvg(composition: PageCompositionSpec): string {
  const width = composition.canvas.width;
  const height = composition.canvas.height;
  const rect = normalizedRectToPixels(composition.maskBox, composition.canvas);
  const blur = Math.max(8, Math.round(composition.fade.featherPx / 2));

  if (composition.fade.shape === "soft_band") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="blur"><feGaussianBlur stdDeviation="${blur}" /></filter>
      </defs>
      <rect width="100%" height="100%" fill="black" />
      <rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" rx="72" ry="72" fill="white" filter="url(#blur)" />
    </svg>`;
  }

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const rx = rect.width / 2;
  const ry = rect.height / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <filter id="blur"><feGaussianBlur stdDeviation="${blur}" /></filter>
    </defs>
    <rect width="100%" height="100%" fill="black" />
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="white" filter="url(#blur)" />
  </svg>`;
}

export async function createFadedArtBackground(artBytes: Buffer, composition: PageCompositionSpec): Promise<Buffer> {
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
  const knockout = await createProtectedTextKnockoutPng(composition, 24);

  return sharp({
    create: {
      width: composition.canvas.width,
      height: composition.canvas.height,
      channels: 4,
      background: "#ffffff"
    }
  })
    .composite([
      { input: masked, blend: "over" },
      { input: knockout.bytes, blend: "over" }
    ])
    .png()
    .toBuffer();
}
