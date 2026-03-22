import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  compositionForTemplate,
  insetPixelRect,
  rightPageGutterSafeRect,
  rightPageMaskRect,
  type PageCompositionSpec
} from "@book/domain";
import { createFadedArtBackground, resolvePlacedArtRect } from "../src/lib/page-canvas.js";

const composition: PageCompositionSpec = compositionForTemplate("text_left_art_right_v1", "read_aloud_3_4");

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

describe("page canvas", () => {
  it("creates a faded right-page art background when the source art is smaller than the canvas", async () => {
    const art = await sharp({
      create: { width: 1024, height: 1024, channels: 4, background: { r: 180, g: 205, b: 220, alpha: 1 } }
    })
      .png()
      .toBuffer();

    const background = await createFadedArtBackground(art, composition);
    const metadata = await sharp(background).metadata();

    expect(background.length).toBeGreaterThan(0);
    expect(metadata.width).toBe(2048);
    expect(metadata.height).toBe(2048);
  });

  it("uses the right-page mask rect as the illustration placement anchor", () => {
    const placementRect = resolvePlacedArtRect(composition);
    const maskRect = rightPageMaskRect(composition);

    expect(placementRect).toEqual(maskRect);
    expect(placementRect.left).toBeGreaterThan(composition.rightPage.gutterSafeInsetPx);
  });

  it("keeps the protected gutter strip white even when the source art is dark at the left edge", async () => {
    const art = await sharp({
      create: { width: 2048, height: 2048, channels: 4, background: { r: 140, g: 152, b: 170, alpha: 1 } }
    })
      .png()
      .toBuffer();

    const background = await createFadedArtBackground(art, composition);
    const gutterRect = insetPixelRect(rightPageGutterSafeRect(composition), 24, composition.canvas);
    const { data, info } = await sharp(background).extract(gutterRect).ensureAlpha().raw().toBuffer({
      resolveWithObject: true
    });
    let occupiedPixels = 0;
    for (let index = 0; index < data.length; index += info.channels) {
      if (luminance(data[index] ?? 255, data[index + 1] ?? 255, data[index + 2] ?? 255) < 0.96) {
        occupiedPixels += 1;
      }
    }

    expect(occupiedPixels).toBe(0);
  });
});
