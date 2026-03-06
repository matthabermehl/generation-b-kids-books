import { describe, expect, it } from "vitest";
import sharp from "sharp";
import type { PageCompositionSpec } from "@book/domain";
import { evaluatePictureBookPage, fitTextToBox } from "../src/lib/page-qa.js";

const composition: PageCompositionSpec = {
  layoutProfileId: "pb_square_8_5_v1",
  templateId: "corner_ul_ellipse",
  canvas: { width: 2048, height: 2048 },
  textBox: { x: 0.08, y: 0.08, width: 0.34, height: 0.25 },
  artBox: { x: 0.40, y: 0.18, width: 0.52, height: 0.62 },
  maskBox: { x: 0.36, y: 0.14, width: 0.58, height: 0.68 },
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
});
