import type { Handler } from "aws-lambda";
import type { BookProductFamily } from "@book/domain";
import { execute, query } from "./lib/rds.js";
import { upsertOpenReviewCase } from "./lib/review-cases.js";

interface Event {
  bookId: string;
  pageId?: string;
}

interface Row {
  total: number;
  ready: number;
  failed: number;
  safety_failed: number;
  order_id: string | null;
  product_family: BookProductFamily;
}

export const handler: Handler<Event> = async (event) => {
  if (!event?.bookId) {
    throw new Error("bookId is required");
  }

  const rows = await query<Row>(
    `
      WITH page_state AS (
        SELECT
          p.id,
          p.status AS page_status,
          b.order_id::text AS order_id,
          COALESCE(b.product_family, 'picture_book_fixed_layout') AS product_family,
          page_image.status AS page_image_status,
          page_image.qa_json AS page_image_qa_json,
          page_art.status AS page_art_status,
          page_art.qa_json AS page_art_qa_json
        FROM pages p
        INNER JOIN books b ON b.id = p.book_id
        LEFT JOIN images page_image
          ON page_image.page_id = p.id
         AND page_image.role = 'page'
         AND page_image.is_current = TRUE
        LEFT JOIN images page_art
          ON page_art.page_id = p.id
         AND page_art.role = 'page_art'
         AND page_art.is_current = TRUE
        WHERE p.book_id = CAST(:bookId AS uuid)
          ${event.pageId ? "AND p.id = CAST(:pageId AS uuid)" : ""}
      )
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE page_status = 'ready'
            AND CASE
              WHEN product_family = 'picture_book_fixed_layout'
                THEN COALESCE(page_art_status, '') = 'ready'
              ELSE COALESCE(page_image_status, '') = 'ready'
            END
        )::int AS ready,
        COUNT(*) FILTER (WHERE page_status = 'failed')::int AS failed,
        COUNT(*) FILTER (
          WHERE COALESCE(
            CASE
              WHEN product_family = 'picture_book_fixed_layout'
                THEN page_art_qa_json::text
              ELSE page_image_qa_json::text
            END,
            ''
          ) ILIKE '%safety_flagged_prompt:%'
        )::int AS safety_failed,
        MAX(order_id) AS order_id,
        MAX(product_family) AS product_family
      FROM page_state
    `,
    [
      { name: "bookId", value: { stringValue: event.bookId } },
      ...(event.pageId ? [{ name: "pageId", value: { stringValue: event.pageId } }] : [])
    ]
  );

  const row = rows[0] ?? {
    total: 0,
    ready: 0,
    failed: 0,
    safety_failed: 0,
    order_id: null,
    product_family: "picture_book_fixed_layout"
  };
  const total = Number(row.total);
  const ready = Number(row.ready);
  const failed = Number(row.failed);
  const safetyFailed = Number(row.safety_failed);
  const productFamily = row.product_family ?? "picture_book_fixed_layout";
  const needsReview =
    safetyFailed > 0 || (productFamily === "picture_book_fixed_layout" && failed > 0);

  if (needsReview && row.order_id) {
    await execute(`UPDATE books SET status = 'needs_review' WHERE id = CAST(:bookId AS uuid)`, [
      { name: "bookId", value: { stringValue: event.bookId } }
    ]);
    await execute(`UPDATE orders SET status = 'needs_review' WHERE id = CAST(:orderId AS uuid)`, [
      { name: "orderId", value: { stringValue: row.order_id } }
    ]);
    console.error(
      JSON.stringify({
        event: "BOOK_NEEDS_REVIEW",
        stage: safetyFailed > 0 ? "image_safety" : "image_qa",
        bookId: event.bookId,
        pageId: event.pageId ?? null,
        orderId: row.order_id,
        failed,
        safetyFailed,
        productFamily
      })
    );
    await upsertOpenReviewCase({
      bookId: event.bookId,
      orderId: row.order_id,
      stage: safetyFailed > 0 ? "image_safety" : "image_qa",
      reasonSummary:
        safetyFailed > 0
          ? `${safetyFailed} page images were flagged for safety review.`
          : `${failed} page images exhausted QA retry budget.`,
      reasonJson: {
        failed,
        safetyFailed,
        total,
        ready,
        productFamily,
        pageId: event.pageId ?? null
      }
    });
  }

  return {
    bookId: event.bookId,
    pageId: event.pageId ?? null,
    total,
    ready,
    failed,
    safetyFailed,
    productFamily,
    needsReview,
    pending: Math.max(total - ready - failed, 0),
    done: total > 0 && ready === total
  };
};
