import sharp from "sharp";
import {
  fitTextToBox,
  leftPageTextRect,
  normalizedRectToPixels,
  rightPageMaskRect,
  type PageCompositionSpec,
  type TextFitResult
} from "@book/domain";
import { rendererFonts } from "./fonts.js";

export type { PageCompositionSpec, TextFitResult };
export { fitTextToBox };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fadeMaskSvg(composition: PageCompositionSpec): string {
  const rect = rightPageMaskRect(composition);
  const blur = Math.max(8, Math.round(composition.rightPage.fade.featherPx / 2));
  if (composition.rightPage.fade.shape === "soft_band") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${composition.canvas.width}" height="${composition.canvas.height}" viewBox="0 0 ${composition.canvas.width} ${composition.canvas.height}">
      <defs><filter id="blur"><feGaussianBlur stdDeviation="${blur}" /></filter></defs>
      <rect width="100%" height="100%" fill="black" />
      <rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" rx="72" ry="72" fill="white" filter="url(#blur)" />
    </svg>`;
  }

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${composition.canvas.width}" height="${composition.canvas.height}" viewBox="0 0 ${composition.canvas.width} ${composition.canvas.height}">
    <defs><filter id="blur"><feGaussianBlur stdDeviation="${blur}" /></filter></defs>
    <rect width="100%" height="100%" fill="black" />
    <ellipse cx="${cx}" cy="${cy}" rx="${rect.width / 2}" ry="${rect.height / 2}" fill="white" filter="url(#blur)" />
  </svg>`;
}

export async function buildArtBackground(artBytes: Buffer, composition: PageCompositionSpec): Promise<Buffer> {
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

function buildTextOverlaySvg(text: string, composition: PageCompositionSpec, fit: TextFitResult): string {
  const rect = leftPageTextRect(composition);
  const lineHeightPx = fit.fontPx * composition.textStyle.lineHeight;
  const tspans = fit.lines
    .map((line, index) => {
      const y = rect.top + fit.fontPx + index * lineHeightPx;
      return `<text x="${rect.left}" y="${y}" font-family="${rendererFonts.bodySvg}" font-size="${fit.fontPx}" fill="#111827">${escapeXml(line)}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${composition.canvas.width}" height="${composition.canvas.height}" viewBox="0 0 ${composition.canvas.width} ${composition.canvas.height}">
    ${tspans}
  </svg>`;
}

async function buildTextPage(text: string, composition: PageCompositionSpec, fit: TextFitResult): Promise<Buffer> {
  return sharp({
    create: {
      width: composition.canvas.width,
      height: composition.canvas.height,
      channels: 4,
      background: "#ffffff"
    }
  })
    .composite([{ input: Buffer.from(buildTextOverlaySvg(text, composition, fit)), blend: "over" }])
    .png()
    .toBuffer();
}

async function buildSpreadPreview(leftPagePng: Buffer, rightPagePng: Buffer, composition: PageCompositionSpec): Promise<Buffer> {
  return sharp({
    create: {
      width: composition.spreadCanvas.width,
      height: composition.spreadCanvas.height,
      channels: 4,
      background: "#ffffff"
    }
  })
    .composite([
      { input: leftPagePng, left: 0, top: 0 },
      { input: rightPagePng, left: composition.canvas.width, top: 0 }
    ])
    .png()
    .toBuffer();
}

export async function renderPictureBookPreview(input: {
  artBytes: Buffer;
  text: string;
  composition: PageCompositionSpec;
}): Promise<{
  previewPng: Buffer;
  artBackgroundPng: Buffer;
  leftPagePng: Buffer;
  rightPagePng: Buffer;
  textFit: TextFitResult;
}> {
  const rightPagePng = await buildArtBackground(input.artBytes, input.composition);
  const textFit = fitTextToBox(input.text, input.composition);
  const leftPagePng = await buildTextPage(input.text, input.composition, textFit);
  const previewPng = await buildSpreadPreview(leftPagePng, rightPagePng, input.composition);

  return {
    previewPng,
    artBackgroundPng: rightPagePng,
    leftPagePng,
    rightPagePng,
    textFit
  };
}
