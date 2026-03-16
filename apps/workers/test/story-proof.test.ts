import { describe, expect, it } from "vitest";
import { renderStoryProofPdf } from "../src/lib/story-proof.js";

function countPdfPages(pdf: Buffer): number {
  const matches = pdf.toString("latin1").match(/\/Type \/Page\b/g);
  return matches?.length ?? 0;
}

describe("story proof pdf", () => {
  it("renders two physical pages per spread with readable story text", async () => {
    const pdf = await renderStoryProofPdf({
      bookId: "book-1",
      title: "Ava Saves",
      spreads: Array.from({ length: 12 }, (_, index) => ({
        index,
        text: `Ava reads spread ${index + 1}.`
      }))
    });

    const text = pdf.toString("latin1");
    expect(countPdfPages(pdf)).toBe(24);
    expect(text).toContain("612072656164732073707265616420312e");
    expect(text).toContain("6b2070656e64696e67");
  });

  it("never injects illustration brief text into the proof pdf", async () => {
    const pdf = await renderStoryProofPdf({
      bookId: "book-2",
      title: "Only Story Text",
      spreads: [
        {
          index: 0,
          text: "Ava counts one, two, three."
        }
      ]
    });

    expect(pdf.toString("latin1")).not.toContain("Illustration prompt: rake leaves with tournament banner");
  });
});
