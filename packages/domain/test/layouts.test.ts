import { describe, expect, it } from "vitest";
import {
  rankPageTemplateCandidates,
  protectedTextRect,
  selectAlternatePageTemplate,
  selectPageComposition
} from "../src/layouts.js";

const earlyDecoderOverflowText = `In the kitchen, Mom sat with Nora.

"You can do chores to earn coins," Mom said. "One coin for each chore."

Nora looked at the list: sweep the steps, fold the socks, wipe the table.

Then Nora saw a soccer sticker on the table. It cost two coins.

"I could buy that sticker now," Nora thought. "But then I would have only three coins left."`;

describe("picture book layouts", () => {
  it("selects deterministic templates for a given page", () => {
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
    expect(first.layoutProfileId).toBe("pb_square_8_5_v1");
  });

  it("avoids repeating the same template family on adjacent pages when alternatives exist", () => {
    const previous = selectPageComposition({
      bookId: "book-2",
      pageIndex: 0,
      text: "This is a longer early reader page that should have enough text to allow multiple templates.",
      readingProfileId: "early_decoder_5_7"
    });

    const current = selectPageComposition({
      bookId: "book-2",
      pageIndex: 1,
      text: "This is another longer early reader page that should prefer a different template family.",
      readingProfileId: "early_decoder_5_7",
      previousTemplateId: previous.templateId
    });

    expect(current.templateId.split("_")[0]).not.toBe(previous.templateId.split("_")[0]);
  });

  it("selects the next deterministic alternate template in ranked order", () => {
    const ranked = rankPageTemplateCandidates({
      bookId: "book-2",
      pageIndex: 3,
      text: earlyDecoderOverflowText,
      readingProfileId: "early_decoder_5_7"
    }).map((entry) => entry.templateId);
    const alternate = selectAlternatePageTemplate({
      bookId: "book-2",
      pageIndex: 3,
      currentTemplateId: ranked[0]!,
      readingProfileId: "early_decoder_5_7",
      text: earlyDecoderOverflowText
    });

    expect(alternate).toBe(ranked[1]);
  });

  it("ranks long early-decoder pages onto tall layouts before soft fallbacks", () => {
    const ranked = rankPageTemplateCandidates({
      bookId: "book-overflow",
      pageIndex: 2,
      text: earlyDecoderOverflowText,
      readingProfileId: "early_decoder_5_7"
    });

    expect(ranked[0]?.templateId).toMatch(/^column_(left|right)_tall$/);
    expect(ranked[0]?.fit.ok).toBe(true);
    expect(ranked.find((entry) => entry.templateId === "column_left_soft")?.fit.ok).toBe(false);
    expect(ranked.find((entry) => entry.templateId === "column_right_soft")?.fit.ok).toBe(false);
  });

  it("expands a protected text rect beyond the live text box", () => {
    const composition = selectPageComposition({
      bookId: "book-3",
      pageIndex: 0,
      text: "A short calm page about saving up for a bike.",
      readingProfileId: "read_aloud_3_4"
    });

    const protectedRect = protectedTextRect(composition);

    expect(protectedRect.width).toBeGreaterThan(Math.round(composition.textBox.width * composition.canvas.width));
    expect(protectedRect.height).toBeGreaterThan(Math.round(composition.textBox.height * composition.canvas.height));
  });
});
