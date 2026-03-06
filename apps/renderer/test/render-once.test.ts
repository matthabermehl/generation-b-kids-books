import type { GetObjectCommandOutput } from "@aws-sdk/client-s3";
import PDFDocument from "pdfkit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPageImageForPdf, renderPdf } from "../src/cli/render-once.js";

const simpleSvg = Buffer.from(
  `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="96" viewBox="0 0 128 96">
  <rect width="128" height="96" fill="#dbeafe"/>
  <text x="10" y="40" font-size="14" font-family="Verdana" fill="#1f2937">scene</text>
</svg>`,
  "utf8"
);

function imageObject(buffer: Buffer, contentType: string): GetObjectCommandOutput {
  return {
    Body: {
      async transformToByteArray() {
        return new Uint8Array(buffer);
      }
    } as GetObjectCommandOutput["Body"],
    ContentType: contentType
  };
}

describe("render-once", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and embeds one image per page", async () => {
    const s3 = {
      send: vi
        .fn()
        .mockResolvedValueOnce(imageObject(simpleSvg, "image/svg+xml"))
        .mockResolvedValueOnce(imageObject(simpleSvg, "image/svg+xml"))
    };

    const imageSpy = vi.spyOn(PDFDocument.prototype, "image");
    const pdf = await renderPdf(
      {
        bookId: "book-1",
        title: "Test Story",
        pages: [
          { index: 0, text: "Page one text.", imageS3Url: "s3://bucket/book/page-1.png" },
          { index: 1, text: "Page two text.", imageS3Url: "s3://bucket/book/page-2.png" }
        ]
      },
      s3
    );

    expect(pdf.length).toBeGreaterThan(0);
    expect(s3.send).toHaveBeenCalledTimes(2);
    expect(imageSpy).toHaveBeenCalledTimes(2);
  });

  it("fails fast when image payload is missing", async () => {
    const s3 = {
      send: vi.fn().mockResolvedValueOnce({
        Body: {
          async transformToByteArray() {
            return new Uint8Array();
          }
        },
        ContentType: "image/png"
      } satisfies GetObjectCommandOutput)
    };

    await expect(loadPageImageForPdf(s3, "s3://bucket/book/page-1.png")).rejects.toThrow(
      "Missing image payload"
    );
  });

  it("does not render raw illustration source text", async () => {
    const s3 = {
      send: vi
        .fn()
        .mockResolvedValueOnce(imageObject(simpleSvg, "image/svg+xml"))
    };

    const pdf = await renderPdf(
      {
        bookId: "book-2",
        title: "No Raw Source Text",
        pages: [{ index: 0, text: "Simple page body.", imageS3Url: "s3://bucket/book/page-1.png" }]
      },
      s3
    );

    expect(pdf.toString("latin1")).not.toContain("Illustration source:");
  });
});
