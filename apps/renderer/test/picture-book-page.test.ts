import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { compositionForTemplate, fitTextToBox as sharedFitTextToBox } from "@book/domain";
import { fitTextToBox, renderPictureBookPreview, type PageCompositionSpec } from "../src/templates/picture-book-page.js";

const composition: PageCompositionSpec = compositionForTemplate("text_left_art_right_v1", "early_decoder_5_7");
const tallText = `Ava put on her coat to go to the park.
She held her jar tight.
"I could buy a treat at the park," she said.
"But if I spend a coin on a treat, I will have less for my night-light."
Ava looked at her coins.
Spend now, or save for later?`;

describe("picture book renderer", () => {
  it("renders a landscape spread preview plus separate left and right page images", async () => {
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

    const previewMeta = await sharp(rendered.previewPng).metadata();
    const leftPageMeta = await sharp(rendered.leftPagePng).metadata();
    const rightPageMeta = await sharp(rendered.rightPagePng).metadata();

    expect(rendered.previewPng.length).toBeGreaterThan(0);
    expect(rendered.artBackgroundPng.length).toBeGreaterThan(0);
    expect(rendered.textFit.ok).toBe(true);
    expect(previewMeta.width).toBe(4096);
    expect(previewMeta.height).toBe(2048);
    expect(leftPageMeta.width).toBe(2048);
    expect(rightPageMeta.width).toBe(2048);
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
    expect(rendered.rightPagePng.length).toBeGreaterThan(0);
    expect(rendered.textFit.ok).toBe(true);
  });

  it("reports overflow for extremely long text", () => {
    const fit = fitTextToBox("word ".repeat(700), composition);
    expect(fit.ok).toBe(false);
  });

  it("uses the shared text fitter for spread layouts and renders matching line breaks", async () => {
    const art = await sharp({
      create: { width: 2048, height: 2048, channels: 4, background: { r: 214, g: 224, b: 236, alpha: 1 } }
    })
      .png()
      .toBuffer();

    const rendered = await renderPictureBookPreview({
      artBytes: art,
      text: tallText,
      composition
    });
    const sharedFit = sharedFitTextToBox(tallText, composition);

    expect(rendered.textFit).toEqual(sharedFit);
    expect(rendered.textFit.ok).toBe(true);
  });
});
