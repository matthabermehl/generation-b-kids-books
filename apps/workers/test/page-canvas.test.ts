import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { compositionForTemplate, rightPageMaskRect, type PageCompositionSpec } from "@book/domain";
import { createFadedArtBackground, resolvePlacedArtRect } from "../src/lib/page-canvas.js";

const composition: PageCompositionSpec = compositionForTemplate("text_left_art_right_v1", "read_aloud_3_4");

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
});
