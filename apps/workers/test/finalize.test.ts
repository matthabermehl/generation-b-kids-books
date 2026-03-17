import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  queryMock,
  executeMock,
  insertCurrentBookArtifactMock,
  resolveActiveReviewCasesForBookMock,
  upsertOpenReviewCaseMock
} = vi.hoisted(() => ({
  queryMock: vi.fn(),
  executeMock: vi.fn(),
  insertCurrentBookArtifactMock: vi.fn(),
  resolveActiveReviewCasesForBookMock: vi.fn(),
  upsertOpenReviewCaseMock: vi.fn()
}));

vi.mock("../src/lib/rds.js", () => ({
  query: queryMock,
  execute: executeMock
}));

vi.mock("../src/lib/records.js", () => ({
  insertCurrentBookArtifact: insertCurrentBookArtifactMock
}));

vi.mock("../src/lib/review-cases.js", () => ({
  resolveActiveReviewCasesForBook: resolveActiveReviewCasesForBookMock,
  upsertOpenReviewCase: upsertOpenReviewCaseMock
}));

import { handler } from "../src/finalize.js";

describe("finalize", () => {
  beforeEach(() => {
    queryMock.mockReset();
    executeMock.mockReset();
    insertCurrentBookArtifactMock.mockReset();
    resolveActiveReviewCasesForBookMock.mockReset();
    upsertOpenReviewCaseMock.mockReset();
    process.env.ARTIFACT_BUCKET = "bucket";
  });

  it("allows finalize-gate approvals to complete the book", async () => {
    queryMock
      .mockResolvedValueOnce([{ needs_review_count: 1, order_id: "order-1" }])
      .mockResolvedValueOnce([{ review_case_id: "case-1" }]);

    const result = await handler(
      {
        bookId: "book-1",
        outputPdfKey: "books/book-1/render/book.pdf"
      } as never,
      {} as never,
      () => undefined
    );

    expect(result).toMatchObject({
      ok: true,
      bookId: "book-1",
      pdfUrl: "s3://bucket/books/book-1/render/book.pdf"
    });
    expect(insertCurrentBookArtifactMock).toHaveBeenCalledWith({
      bookId: "book-1",
      artifactType: "pdf",
      s3Url: "s3://bucket/books/book-1/render/book.pdf"
    });
    expect(upsertOpenReviewCaseMock).not.toHaveBeenCalled();
    expect(resolveActiveReviewCasesForBookMock).toHaveBeenCalledWith("book-1", "resolved");
  });

  it("reopens finalize-gate review when no approval override exists", async () => {
    queryMock
      .mockResolvedValueOnce([{ needs_review_count: 2, order_id: "order-1" }])
      .mockResolvedValueOnce([]);

    await expect(
      handler(
        {
          bookId: "book-1"
        } as never,
        {} as never,
        () => undefined
      )
    ).rejects.toThrow("BOOK_NEEDS_REVIEW:finalize_gate");

    expect(insertCurrentBookArtifactMock).not.toHaveBeenCalled();
    expect(upsertOpenReviewCaseMock).toHaveBeenCalledWith({
      bookId: "book-1",
      orderId: "order-1",
      stage: "finalize_gate",
      reasonSummary: "Finalize gate blocked because 2 review signals remain active.",
      reasonJson: {
        needsReviewCount: 2
      }
    });
  });
});
