import { describe, expect, it } from "vitest";
import {
  compositionForTemplate,
  rankPageTemplateCandidates,
  rightPageGutterSafeRect,
  rightPageMaskRect,
  selectAlternatePageTemplate,
  selectPageComposition
} from "../src/layouts.js";

const earlyDecoderOverflowText = `In the kitchen, Mom sat with Nora.

"You can do chores to earn coins," Mom said. "One coin for each chore."

Nora looked at the list: sweep the steps, fold the socks, wipe the table.

Then Nora saw a soccer sticker on the table. It cost two coins.

"I could buy that sticker now," Nora thought. "But then I would have only three coins left."`;

describe("picture book layouts", () => {
  it("selects deterministic spread compositions for a given page", () => {
    const first = selectPageComposition({
      bookId: "book-1",
      pageIndex: 0,
      text: "A short calm page about saving up for a bike.",
      readingProfileId: "read_aloud_3_4"
    });

    const second = selectPageComposition({
      bookId: "book-1",
      pageIndex: 0,
      text: "A short calm page about saving up for a bike.",
      readingProfileId: "read_aloud_3_4"
    });

    expect(first).toEqual(second);
    expect(first.layoutProfileId).toBe("pb_square_spread_8_5_v1");
    expect(first.templateId).toBe("text_left_art_right_v1");
  });

  it("uses the same canonical spread template for all picture-book pages in v1", () => {
    const composition = compositionForTemplate("text_left_art_right_v1", "early_decoder_5_7");

    expect(composition.leftPage.textBox.width).toBeGreaterThan(0.7);
    expect(composition.spreadCanvas.width).toBe(composition.canvas.width * 2);
  });

  it("does not offer alternate spread templates in v1", () => {
    const alternate = selectAlternatePageTemplate({
      bookId: "book-2",
      pageIndex: 3,
      currentTemplateId: "text_left_art_right_v1",
      readingProfileId: "early_decoder_5_7",
      text: earlyDecoderOverflowText
    });

    expect(alternate).toBeNull();
  });

  it("fits long early-decoder text on the dedicated left text page", () => {
    const ranked = rankPageTemplateCandidates({
      bookId: "book-overflow",
      pageIndex: 2,
      text: earlyDecoderOverflowText,
      readingProfileId: "early_decoder_5_7"
    });

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.templateId).toBe("text_left_art_right_v1");
    expect(ranked[0]?.fit.ok).toBe(true);
  });

  it("keeps the editable art mask away from the protected inner gutter strip", () => {
    const composition = compositionForTemplate("text_left_art_right_v1", "read_aloud_3_4");
    const gutterRect = rightPageGutterSafeRect(composition);
    const maskRect = rightPageMaskRect(composition);

    expect(gutterRect.width).toBe(composition.rightPage.gutterSafeInsetPx);
    expect(maskRect.left).toBeGreaterThan(gutterRect.width);
  });
});
