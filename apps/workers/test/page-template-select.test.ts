import { describe, expect, it } from "vitest";
import { listPictureBookCompositionCandidates, selectAlternatePictureBookComposition } from "../src/lib/page-template-select.js";

const earlyDecoderOverflowText = `In the kitchen, Mom sat with Nora.

"You can do chores to earn coins," Mom said. "One coin for each chore."

Nora looked at the list: sweep the steps, fold the socks, wipe the table.

Then Nora saw a soccer sticker on the table. It cost two coins.

"I could buy that sticker now," Nora thought. "But then I would have only three coins left."`;

describe("picture book template selection", () => {
  it("lists overflow rescue candidates in ranked order", () => {
    const candidates = listPictureBookCompositionCandidates({
      bookId: "book-overflow",
      pageIndex: 2,
      text: earlyDecoderOverflowText,
      readingProfileId: "early_decoder_5_7"
    });

    expect(candidates[0]?.templateId).toMatch(/^column_(left|right)_tall$/);
    expect(candidates[1]?.templateId).toMatch(/^column_(left|right)_tall$/);
    expect(candidates[2]?.templateId).toMatch(/^band_(top|bottom)_tall$/);
  });

  it("walks the next ranked composition for overflow retries", () => {
    const candidates = listPictureBookCompositionCandidates({
      bookId: "book-overflow",
      pageIndex: 2,
      text: earlyDecoderOverflowText,
      readingProfileId: "early_decoder_5_7"
    });

    const second = selectAlternatePictureBookComposition({
      bookId: "book-overflow",
      pageIndex: 2,
      text: earlyDecoderOverflowText,
      currentTemplateId: candidates[0]!.templateId,
      readingProfileId: "early_decoder_5_7"
    });
    const third = selectAlternatePictureBookComposition({
      bookId: "book-overflow",
      pageIndex: 2,
      text: earlyDecoderOverflowText,
      currentTemplateId: second!.templateId,
      readingProfileId: "early_decoder_5_7"
    });

    expect(second?.templateId).toBe(candidates[1]?.templateId);
    expect(third?.templateId).toBe(candidates[2]?.templateId);
  });
});
