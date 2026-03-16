import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { compositionForTemplate, rightPageGutterSafeRect, type PageCompositionSpec } from "@book/domain";
import { createExpandedMaskPng } from "../src/lib/page-mask.js";

const composition: PageCompositionSpec = compositionForTemplate("text_left_art_right_v1", "read_aloud_3_4");

async function sampleGray(buffer: Buffer, left: number, top: number): Promise<number> {
  const { data } = await sharp(buffer)
    .extract({ left, top, width: 1, height: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data[0] ?? 0;
}

describe("page mask", () => {
  it("keeps the editable region white and the gutter-safe strip black", async () => {
    const mask = await createExpandedMaskPng(composition);
    const editableCenter = {
      left: mask.rect.left + Math.floor(mask.rect.width / 2),
      top: mask.rect.top + Math.floor(mask.rect.height / 2)
    };
    const gutterRect = rightPageGutterSafeRect(composition);
    const gutterCenter = {
      left: Math.floor(gutterRect.width / 2),
      top: Math.floor(gutterRect.height / 2)
    };

    expect(await sampleGray(mask.bytes, editableCenter.left, editableCenter.top)).toBe(255);
    expect(await sampleGray(mask.bytes, gutterCenter.left, gutterCenter.top)).toBe(0);
    expect(mask.gutterSafeRect).toEqual(gutterRect);
  });
});
