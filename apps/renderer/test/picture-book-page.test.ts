import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { fitTextToBox, renderPictureBookPreview, type PageCompositionSpec } from "../src/templates/picture-book-page.js";

const composition: PageCompositionSpec = {
  layoutProfileId: "pb_square_8_5_v1",
  templateId: "band_top_soft",
  canvas: { width: 2048, height: 2048 },
  textBox: { x: 0.10, y: 0.08, width: 0.80, height: 0.18 },
  artBox: { x: 0.12, y: 0.26, width: 0.76, height: 0.58 },
  maskBox: { x: 0.10, y: 0.22, width: 0.80, height: 0.64 },
  fade: { shape: "soft_band", featherPx: 88 },
  textStyle: {
    readingProfileId: "early_decoder_5_7",
    preferredFontPx: 64,
    minFontPx: 52,
    lineHeight: 1.24,
    align: "left"
  }
};

describe("picture book renderer", () => {
  it("renders a preview png from art and text", async () => {
    const art = await sharp({
      create: { width: 2048, height: 2048, channels: 4, background: { r: 180, g: 210, b: 200, alpha: 1 } }
    })
      .png()
      .toBuffer();

    const rendered = await renderPictureBookPreview({
      artBytes: art,
      text: "Mia notices that prices can change while she saves.",
      composition
    });

    expect(rendered.previewPng.length).toBeGreaterThan(0);
    expect(rendered.artBackgroundPng.length).toBeGreaterThan(0);
    expect(rendered.textFit.ok).toBe(true);
  });

  it("renders a preview when the art input is smaller than the page canvas", async () => {
    const art = await sharp({
      create: { width: 1024, height: 1024, channels: 4, background: { r: 160, g: 190, b: 220, alpha: 1 } }
    })
      .png()
      .toBuffer();

    const rendered = await renderPictureBookPreview({
      artBytes: art,
      text: "Mia waits patiently while the seeds begin to grow.",
      composition
    });

    expect(rendered.previewPng.length).toBeGreaterThan(0);
    expect(rendered.artBackgroundPng.length).toBeGreaterThan(0);
    expect(rendered.textFit.ok).toBe(true);
  });

  it("reports overflow for extremely long text", () => {
    const fit = fitTextToBox("word ".repeat(400), composition);
    expect(fit.ok).toBe(false);
  });
});
