import sharp from "sharp";
import {
  rightPageFadeMaskSvg,
  rightPageGutterSafeRect,
  rightPageMaskRect,
  type PageCompositionSpec,
  type PixelRect
} from "@book/domain";

export function resolvePlacedArtRect(composition: PageCompositionSpec): PixelRect {
  return rightPageMaskRect(composition);
}

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

export async function createFadedArtBackground(artBytes: Buffer, composition: PageCompositionSpec): Promise<Buffer> {
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
