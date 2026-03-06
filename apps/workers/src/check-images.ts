import type { Handler } from "aws-lambda";
import { execute, query } from "./lib/rds.js";

interface Event {
  bookId: string;
}

interface Row {
  total: number;
  ready: number;
  failed: number;
  safety_failed: number;
  order_id: string | null;
}

export const handler: Handler<Event> = async (event) => {
  if (!event?.bookId) {
    throw new Error("bookId is required");
  }

  const rows = await query<Row>(
    `
      SELECT
        COUNT(p.*)::int AS total,
        COUNT(p.*) FILTER (WHERE p.status = 'ready')::int AS ready,
        COUNT(p.*) FILTER (WHERE p.status = 'failed')::int AS failed,
        COUNT(i.*) FILTER (WHERE COALESCE(i.qa_json::text, '') ILIKE '%safety_flagged_prompt:%')::int AS safety_failed,
        MAX(b.order_id::text) AS order_id
      FROM pages p
      INNER JOIN books b ON b.id = p.book_id
      LEFT JOIN images i ON i.page_id = p.id AND i.role IN ('page', 'page_fill')
      WHERE p.book_id = CAST(:bookId AS uuid)
    `,
    [{ name: "bookId", value: { stringValue: event.bookId } }]
  );

  const row = rows[0] ?? { total: 0, ready: 0, failed: 0, safety_failed: 0, order_id: null };
  const total = Number(row.total);
  const ready = Number(row.ready);
  const failed = Number(row.failed);
  const safetyFailed = Number(row.safety_failed);
  const needsReview = failed > 0 && safetyFailed > 0;

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
        stage: "image_safety",
        bookId: event.bookId,
        orderId: row.order_id,
        safetyFailed
      })
    );
  }

  return {
    bookId: event.bookId,
    total,
    ready,
    failed,
    safetyFailed,
    needsReview,
    pending: Math.max(total - ready - failed, 0),
    done: total > 0 && ready === total
  };
};
