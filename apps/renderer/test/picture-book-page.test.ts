import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { compositionForTemplate, fitTextToBox as sharedFitTextToBox } from "@book/domain";
import { fitTextToBox, renderPictureBookPreview, type PageCompositionSpec } from "../src/templates/picture-book-page.js";

const composition: PageCompositionSpec = compositionForTemplate("band_top_soft", "early_decoder_5_7");
const tallComposition: PageCompositionSpec = compositionForTemplate("band_top_tall", "read_aloud_3_4");
const tallText = `Ava put on her coat to go to the park.
She held her jar tight.
"I could buy a treat at the park," she said.
"But if I spend a coin on a treat, I will have less for my night-light."
Ava looked at her coins.
Spend now, or save for later?`;

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

  it("uses the shared text fitter for tall layouts and renders matching line breaks", async () => {
    const art = await sharp({
      create: { width: 2048, height: 2048, channels: 4, background: { r: 214, g: 224, b: 236, alpha: 1 } }
    })
      .png()
      .toBuffer();

    const rendered = await renderPictureBookPreview({
      artBytes: art,
      text: tallText,
      composition: tallComposition
    });
    const sharedFit = sharedFitTextToBox(tallText, tallComposition);

    expect(rendered.textFit).toEqual(sharedFit);
    expect(rendered.textFit.ok).toBe(true);
  });
});
