import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { compositionForTemplate } from "@book/domain";
import { evaluatePictureBookPage, fitTextToBox } from "../src/lib/page-qa.js";

const composition = compositionForTemplate("text_left_art_right_v1", "read_aloud_3_4");

const earlyDecoderOverflowText = `In the kitchen, Mom sat with Nora.

"You can do chores to earn coins," Mom said. "One coin for each chore."

Nora looked at the list: sweep the steps, fold the socks, wipe the table.

Then Nora saw a soccer sticker on the table. It cost two coins.

"I could buy that sticker now," Nora thought. "But then I would have only three coins left."`;

describe("picture book page qa", () => {
  it("fits short text into the dedicated left-page text box", () => {
    const fit = fitTextToBox("Mia counts coins on the kitchen table.", composition);
    expect(fit.ok).toBe(true);
    expect(fit.lines.length).toBeGreaterThan(0);
  });

  it("fits long early-decoder text on the dedicated left text page", () => {
    const fit = fitTextToBox(earlyDecoderOverflowText, compositionForTemplate("text_left_art_right_v1", "early_decoder_5_7"));
    expect(fit.ok).toBe(true);
  });

  it("passes when the gutter stays white and the art occupies the right-page illustration area", async () => {
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
          left: 760,
          top: 420
        }
      ])
      .png()
      .toBuffer();

    const result = await evaluatePictureBookPage(page, composition, "Mia counts coins on the kitchen table.");
    expect(result.passed).toBe(true);
  });

  it("flags gutter intrusion when non-white pixels creep into the inner gutter strip", async () => {
    const page = await sharp({
      create: { width: 2048, height: 2048, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
    })
      .composite([
        {
          input: await sharp({
            create: { width: 180, height: 1200, channels: 4, background: { r: 215, g: 188, b: 150, alpha: 1 } }
          })
            .png()
            .toBuffer(),
          left: 40,
          top: 400
        }
      ])
      .png()
      .toBuffer();

    const result = await evaluatePictureBookPage(page, composition, "Mia counts coins on the kitchen table.");
    expect(result.passed).toBe(false);
    expect(result.issues).toContain("gutter_intrusion");
  });

  it("flags weak art when the painted area does not fill enough of the right-page art box", async () => {
    const page = await sharp({
      create: { width: 2048, height: 2048, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
    })
      .composite([
        {
          input: await sharp({
            create: { width: 180, height: 180, channels: 4, background: { r: 187, g: 208, b: 221, alpha: 1 } }
          })
            .png()
            .toBuffer(),
          left: 980,
          top: 920
        }
      ])
      .png()
      .toBuffer();

    const result = await evaluatePictureBookPage(page, composition, "Mia counts coins on the kitchen table.");
    expect(result.passed).toBe(false);
    expect(result.issues).toContain("weak_art");
  });
});
