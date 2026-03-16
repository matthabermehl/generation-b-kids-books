import sharp from "sharp";
import { rightPageMaskRect, type PageCompositionSpec, type PixelRect } from "@book/domain";

export function resolvePlacedArtRect(composition: PageCompositionSpec): PixelRect {
  return rightPageMaskRect(composition);
}

function fadeMaskSvg(composition: PageCompositionSpec): string {
  const width = composition.canvas.width;
  const height = composition.canvas.height;
  const rect = rightPageMaskRect(composition);
  const blur = Math.max(8, Math.round(composition.rightPage.fade.featherPx / 2));

  if (composition.rightPage.fade.shape === "soft_band") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs><filter id="blur"><feGaussianBlur stdDeviation="${blur}" /></filter></defs>
      <rect width="100%" height="100%" fill="black" />
      <rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" rx="72" ry="72" fill="white" filter="url(#blur)" />
    </svg>`;
  }

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><filter id="blur"><feGaussianBlur stdDeviation="${blur}" /></filter></defs>
    <rect width="100%" height="100%" fill="black" />
    <ellipse cx="${cx}" cy="${cy}" rx="${rect.width / 2}" ry="${rect.height / 2}" fill="white" filter="url(#blur)" />
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
