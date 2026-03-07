import { describe, expect, it } from "vitest";
import {
  protectedTextRect,
  selectAlternatePageTemplate,
  selectPageComposition
} from "../src/layouts.js";

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

  it("selects a deterministic alternate template from a different family", () => {
    const alternate = selectAlternatePageTemplate({
      currentTemplateId: "corner_ul_ellipse",
      readingProfileId: "early_decoder_5_7",
      text: "This is another longer early reader page that should prefer a different template family."
    });

    expect(alternate).toBe("band_top_soft");
    expect(alternate?.split("_")[0]).not.toBe("corner");
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
