import { describe, expect, it } from "vitest";
import { listPictureBookCompositionCandidates, selectAlternatePictureBookComposition } from "../src/lib/page-template-select.js";

const earlyDecoderOverflowText = `In the kitchen, Mom sat with Nora.

"You can do chores to earn coins," Mom said. "One coin for each chore."

Nora looked at the list: sweep the steps, fold the socks, wipe the table.

Then Nora saw a soccer sticker on the table. It cost two coins.

"I could buy that sticker now," Nora thought. "But then I would have only three coins left."`;

describe("picture book template selection", () => {
  it("lists the single spread composition candidate in v1", () => {
    const candidates = listPictureBookCompositionCandidates({
      bookId: "book-overflow",
      pageIndex: 2,
      text: earlyDecoderOverflowText,
      readingProfileId: "early_decoder_5_7"
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.templateId).toBe("text_left_art_right_v1");
  });

  it("does not return an alternate composition in v1", () => {
    const alternate = selectAlternatePictureBookComposition({
      bookId: "book-overflow",
      pageIndex: 2,
      text: earlyDecoderOverflowText,
      currentTemplateId: "text_left_art_right_v1",
      readingProfileId: "early_decoder_5_7"
    });

    expect(alternate).toBeNull();
  });
});
