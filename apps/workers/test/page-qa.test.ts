import { describe, expect, it } from "vitest";
import sharp from "sharp";
import type { PageCompositionSpec } from "@book/domain";
import { evaluatePictureBookPage, fitTextToBox } from "../src/lib/page-qa.js";

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

describe("picture book page qa", () => {
  it("fits short text into the configured text box", () => {
    const fit = fitTextToBox("Mia counts coins on the kitchen table.", composition);
    expect(fit.ok).toBe(true);
    expect(fit.lines.length).toBeGreaterThan(0);
  });

  it("flags busy text zones on dark pages", async () => {
    const darkPage = await sharp({
      create: { width: 2048, height: 2048, channels: 4, background: { r: 40, g: 50, b: 60, alpha: 1 } }
    })
      .png()
      .toBuffer();

    const result = await evaluatePictureBookPage(darkPage, composition, "Mia counts coins on the kitchen table.");
    expect(result.passed).toBe(false);
    expect(result.issues).toContain("text_zone_busy");
  });

  it("passes when the text zone is kept white and art stays in the art box", async () => {
    const page = await sharp({
      create: { width: 2048, height: 2048, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
    })
      .composite([
        {
          input: await sharp({
            create: { width: 980, height: 980, channels: 4, background: { r: 187, g: 208, b: 221, alpha: 1 } }
          })
            .png()
            .toBuffer(),
          left: 980,
          top: 540
        }
      ])
      .png()
      .toBuffer();

    const result = await evaluatePictureBookPage(page, composition, "Mia counts coins on the kitchen table.");
    expect(result.passed).toBe(true);
  });

  it("flags text spill when non-white pixels encroach into the inset text zone", async () => {
    const page = await sharp({
      create: { width: 2048, height: 2048, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
    })
      .composite([
        {
          input: await sharp({
            create: { width: 260, height: 180, channels: 4, background: { r: 215, g: 188, b: 150, alpha: 1 } }
          })
            .png()
            .toBuffer(),
          left: 220,
          top: 180
        }
      ])
      .png()
      .toBuffer();

    const result = await evaluatePictureBookPage(page, composition, "Mia counts coins on the kitchen table.");
    expect(result.passed).toBe(false);
    expect(result.issues).toContain("text_zone_spill");
  });
});
