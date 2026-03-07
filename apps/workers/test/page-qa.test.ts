import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { compositionForTemplate } from "@book/domain";
import { evaluatePictureBookPage, fitTextToBox } from "../src/lib/page-qa.js";

const composition = compositionForTemplate("corner_ul_ellipse", "read_aloud_3_4");

const earlyDecoderOverflowText = `In the kitchen, Mom sat with Nora.

"You can do chores to earn coins," Mom said. "One coin for each chore."

Nora looked at the list: sweep the steps, fold the socks, wipe the table.

Then Nora saw a soccer sticker on the table. It cost two coins.

"I could buy that sticker now," Nora thought. "But then I would have only three coins left."`;

const readAloudOverflowText = `Ava put on her coat to go to the park.
She held her jar tight.
"I could buy a treat at the park," she said.
"But if I spend a coin on a treat, I will have less for my night-light."
Ava looked at her coins.
Spend now, or save for later?`;

describe("picture book page qa", () => {
  it("fits short text into the configured text box", () => {
    const fit = fitTextToBox("Mia counts coins on the kitchen table.", composition);
    expect(fit.ok).toBe(true);
    expect(fit.lines.length).toBeGreaterThan(0);
  });

  it("keeps early-decoder overflow text off the old soft column but fits it on the tall column", () => {
    const softFit = fitTextToBox(earlyDecoderOverflowText, compositionForTemplate("column_left_soft", "early_decoder_5_7"));
    const tallFit = fitTextToBox(earlyDecoderOverflowText, compositionForTemplate("column_left_tall", "early_decoder_5_7"));

    expect(softFit.ok).toBe(false);
    expect(tallFit.ok).toBe(true);
  });

  it("keeps read-aloud overflow text off the old corner layout but fits it on the tall band", () => {
    const cornerFit = fitTextToBox(readAloudOverflowText, compositionForTemplate("corner_ur_ellipse", "read_aloud_3_4"));
    const tallFit = fitTextToBox(readAloudOverflowText, compositionForTemplate("band_top_tall", "read_aloud_3_4"));

    expect(cornerFit.ok).toBe(false);
    expect(tallFit.ok).toBe(true);
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
