import { describe, expect, it } from "vitest";
import sharp from "sharp";
import type { PageCompositionSpec } from "@book/domain";
import { createExpandedMaskPng } from "../src/lib/page-mask.js";

const composition: PageCompositionSpec = {
  layoutProfileId: "pb_square_8_5_v1",
  templateId: "corner_ul_ellipse",
  canvas: { width: 2048, height: 2048 },
  textBox: { x: 0.08, y: 0.08, width: 0.34, height: 0.25 },
  artBox: { x: 0.44, y: 0.22, width: 0.48, height: 0.56 },
  maskBox: { x: 0.42, y: 0.18, width: 0.52, height: 0.62 },
  fade: { shape: "ellipse", featherPx: 120 },
  textStyle: {
    readingProfileId: "read_aloud_3_4",
    preferredFontPx: 78,
    minFontPx: 62,
    lineHeight: 1.18,
    align: "left"
  }
};

async function sampleGray(buffer: Buffer, left: number, top: number): Promise<number> {
  const { data } = await sharp(buffer)
    .extract({ left, top, width: 1, height: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data[0] ?? 0;
}

describe("page mask", () => {
  it("keeps the protected text region black and the editable art region white", async () => {
    const mask = await createExpandedMaskPng(composition);
    const editableCenter = {
      left: mask.rect.left + Math.floor(mask.rect.width / 2),
      top: mask.rect.top + Math.floor(mask.rect.height / 2)
    };
    const protectedCenter = {
      left: mask.protectedTextRect.left + Math.floor(mask.protectedTextRect.width / 2),
      top: mask.protectedTextRect.top + Math.floor(mask.protectedTextRect.height / 2)
    };

    expect(await sampleGray(mask.bytes, editableCenter.left, editableCenter.top)).toBe(255);
    expect(await sampleGray(mask.bytes, protectedCenter.left, protectedCenter.top)).toBe(0);
  });
});
