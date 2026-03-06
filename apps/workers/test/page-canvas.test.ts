import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { normalizedRectToPixels, type PageCompositionSpec } from "@book/domain";
import { createFadedArtBackground, resolvePlacedArtRect } from "../src/lib/page-canvas.js";

const composition: PageCompositionSpec = {
  layoutProfileId: "pb_square_8_5_v1",
  templateId: "corner_ul_ellipse",
  canvas: { width: 2048, height: 2048 },
  textBox: { x: 0.08, y: 0.08, width: 0.34, height: 0.25 },
  artBox: { x: 0.44, y: 0.22, width: 0.48, height: 0.56 },
  maskBox: { x: 0.42, y: 0.18, width: 0.52, height: 0.62 },
  fade: { shape: "ellipse", featherPx: 120 },
  textStyle: {
    readingProfileId: "read_aloud_3_4",
    preferredFontPx: 78,
    minFontPx: 62,
    lineHeight: 1.18,
    align: "left"
  }
};

describe("page canvas", () => {
  it("creates a faded art background when the source art is smaller than the canvas", async () => {
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

  it("pushes directional overflow away from the text-safe corner", () => {
    const placementRect = resolvePlacedArtRect(composition);
    const artRect = normalizedRectToPixels(composition.artBox, composition.canvas);

    expect(artRect.left - placementRect.left).toBe(24);
    expect(placementRect.width - artRect.width - (artRect.left - placementRect.left)).toBe(120);
    expect(placementRect.height - artRect.height - (artRect.top - placementRect.top)).toBe(120);
  });
});
