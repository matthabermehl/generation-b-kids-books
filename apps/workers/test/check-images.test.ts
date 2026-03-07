import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, executeMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  executeMock: vi.fn()
}));

vi.mock("../src/lib/rds.js", () => ({
  query: queryMock,
  execute: executeMock
}));

import { handler } from "../src/check-images.js";

describe("check-images", () => {
  beforeEach(() => {
    queryMock.mockReset();
    executeMock.mockReset();
  });

  it("routes failed picture-book pages to needs_review", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          total: 12,
          ready: 11,
          failed: 1,
          safety_failed: 0,
          order_id: "order-1",
          product_family: "picture_book_fixed_layout"
        }
      ])
      .mockResolvedValueOnce([]);

    const result = await handler({ bookId: "book-1" } as never, {} as never, () => undefined);

    expect(result).toMatchObject({
      failed: 1,
      needsReview: true,
      productFamily: "picture_book_fixed_layout"
    });
    expect(executeMock).toHaveBeenCalledTimes(3);
  });

  it("keeps legacy non-safety failures out of needs_review", async () => {
    queryMock.mockResolvedValue([
      {
        total: 12,
        ready: 11,
        failed: 1,
        safety_failed: 0,
        order_id: "order-2",
        product_family: "chapter_book_reflowable"
      }
    ]);

    const result = await handler({ bookId: "book-2" } as never, {} as never, () => undefined);

    expect(result).toMatchObject({
      failed: 1,
      needsReview: false,
      productFamily: "chapter_book_reflowable"
    });
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("does not report done until the current picture-book fill image is ready", async () => {
    queryMock.mockResolvedValue([
      {
        total: 12,
        ready: 11,
        failed: 0,
        safety_failed: 0,
        order_id: "order-3",
        product_family: "picture_book_fixed_layout"
      }
    ]);

    const result = await handler({ bookId: "book-3" } as never, {} as never, () => undefined);

    expect(result).toMatchObject({
      ready: 11,
      pending: 1,
      done: false,
      needsReview: false,
      productFamily: "picture_book_fixed_layout"
    });
    expect(executeMock).not.toHaveBeenCalled();
  });
});
