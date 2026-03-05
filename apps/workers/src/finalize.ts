import type { Handler } from "aws-lambda";
import { execute, query } from "./lib/rds.js";
import { makeId } from "./lib/helpers.js";

interface Event {
  bookId: string;
  outputPdfKey: string;
}

export const handler: Handler<Event> = async (event) => {
  if (!event?.bookId || !event.outputPdfKey) {
    throw new Error("bookId and outputPdfKey are required");
  }

  const s3Url = `s3://${process.env.ARTIFACT_BUCKET}/${event.outputPdfKey}`;

  const reviewRows = await query<{ needs_review_count: number; order_id: string | null }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE verdict = 'needs_review')::int AS needs_review_count,
        MAX(order_id::text) AS order_id
      FROM (
        SELECT e.verdict, b.order_id
        FROM evaluations e
        INNER JOIN books b ON b.id = e.book_id
        WHERE e.book_id = CAST(:bookId AS uuid)
      ) src
    `,
    [{ name: "bookId", value: { stringValue: event.bookId } }]
  );

  const needsReviewCount = Number(reviewRows[0]?.needs_review_count ?? 0);
  const orderId = reviewRows[0]?.order_id;
  if (needsReviewCount > 0 && orderId) {
    await execute(`UPDATE books SET status = 'needs_review' WHERE id = CAST(:bookId AS uuid)`, [
      { name: "bookId", value: { stringValue: event.bookId } }
    ]);
    await execute(`UPDATE orders SET status = 'needs_review' WHERE id = CAST(:orderId AS uuid)`, [
      { name: "orderId", value: { stringValue: orderId } }
    ]);
    console.error(
      JSON.stringify({
        event: "BOOK_NEEDS_REVIEW",
        stage: "finalize_gate",
        bookId: event.bookId,
        orderId,
        needsReviewCount
      })
    );
    throw new Error("BOOK_NEEDS_REVIEW:finalize_gate");
  }

  await execute(
    `
      INSERT INTO book_artifacts (id, book_id, artifact_type, s3_url)
      VALUES (CAST(:id AS uuid), CAST(:bookId AS uuid), 'pdf', :s3)
    `,
    [
      { name: "id", value: { stringValue: makeId() } },
      { name: "bookId", value: { stringValue: event.bookId } },
      { name: "s3", value: { stringValue: s3Url } }
    ]
  );

  await execute(
    `
      UPDATE books
      SET status = 'ready', ready_at = NOW()
      WHERE id = CAST(:bookId AS uuid)
    `,
    [{ name: "bookId", value: { stringValue: event.bookId } }]
  );

  await execute(
    `
      UPDATE orders
      SET status = 'ready'
      WHERE id = (SELECT order_id FROM books WHERE id = CAST(:bookId AS uuid) LIMIT 1)
    `,
    [{ name: "bookId", value: { stringValue: event.bookId } }]
  );

  return {
    ok: true,
    bookId: event.bookId,
    pdfUrl: s3Url
  };
};
