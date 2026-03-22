import sharp from "sharp";
import {
  fitTextToBox,
  leftPageTextRect,
  rightPageFadeMaskSvg,
  rightPageGutterSafeRect,
  type PageCompositionSpec,
  type TextFitResult
} from "@book/domain";
import { rendererFonts } from "./fonts.js";

export type { PageCompositionSpec, TextFitResult };
export { fitTextToBox };

async function createFadeMask(composition: PageCompositionSpec): Promise<Buffer> {
  const gutterRect = rightPageGutterSafeRect(composition);
  const baseMask = await sharp(Buffer.from(rightPageFadeMaskSvg(composition))).png().toBuffer();
  const gutterCutout = await sharp({
    create: {
      width: gutterRect.width,
      height: gutterRect.height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .png()
    .toBuffer();

  return sharp(baseMask)
    .composite([{ input: gutterCutout, left: gutterRect.left, top: gutterRect.top, blend: "dest-out" }])
    .png()
    .toBuffer();
}

async function createGutterWhiteout(composition: PageCompositionSpec): Promise<{ buffer: Buffer; left: number; top: number }> {
  const gutterRect = rightPageGutterSafeRect(composition);
  const buffer = await sharp({
    create: {
      width: gutterRect.width,
      height: gutterRect.height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .png()
    .toBuffer();

  return {
    buffer,
    left: gutterRect.left,
    top: gutterRect.top
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function buildArtBackground(artBytes: Buffer, composition: PageCompositionSpec): Promise<Buffer> {
  const mask = await createFadeMask(composition);
  const alphaMask = await sharp(mask).extractChannel("alpha").toBuffer();
  const gutterWhiteout = await createGutterWhiteout(composition);
  const normalizedArt = await sharp(artBytes)
    .resize({
      width: composition.canvas.width,
      height: composition.canvas.height,
      fit: "cover"
    })
    .ensureAlpha()
    .png()
    .toBuffer();
  const masked = await sharp(normalizedArt).removeAlpha().joinChannel(alphaMask).png().toBuffer();

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
      { input: gutterWhiteout.buffer, left: gutterWhiteout.left, top: gutterWhiteout.top, blend: "over" }
    ])
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
