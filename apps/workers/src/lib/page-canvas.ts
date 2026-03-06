import sharp from "sharp";
import type { PageCompositionSpec } from "@book/domain";
import { normalizedRectToPixels } from "./page-mask.js";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export async function createPlacedPageCanvas(
  sceneBytes: Buffer,
  composition: PageCompositionSpec,
  overflowRatio = 0.08
): Promise<Buffer> {
  const artRect = normalizedRectToPixels(composition.artBox, composition.canvas);
  const overflowPx = Math.round(composition.canvas.width * overflowRatio);
  const targetWidth = clamp(artRect.width + overflowPx * 2, 1, composition.canvas.width);
  const targetHeight = clamp(artRect.height + overflowPx * 2, 1, composition.canvas.height);
  const left = clamp(artRect.left - overflowPx, 0, composition.canvas.width - targetWidth);
  const top = clamp(artRect.top - overflowPx, 0, composition.canvas.height - targetHeight);

  const sceneLayer = await sharp(sceneBytes)
    .resize({ width: targetWidth, height: targetHeight, fit: "cover" })
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
    .composite([{ input: sceneLayer, left, top }])
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
  const masked = await sharp(artBytes).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();

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
