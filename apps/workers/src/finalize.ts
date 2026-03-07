import type { Handler } from "aws-lambda";
import { execute, query } from "./lib/rds.js";
import { insertCurrentBookArtifact } from "./lib/records.js";
import { resolveActiveReviewCasesForBook, upsertOpenReviewCase } from "./lib/review-cases.js";

interface Event {
  bookId: string;
  outputPdfKey?: string;
}

export const handler: Handler<Event> = async (event) => {
  if (!event?.bookId) {
    throw new Error("bookId is required");
  }

  const outputPdfKey = event.outputPdfKey ?? `books/${event.bookId}/render/book.pdf`;
  const s3Url = `s3://${process.env.ARTIFACT_BUCKET}/${outputPdfKey}`;

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
    await upsertOpenReviewCase({
      bookId: event.bookId,
      orderId,
      stage: "finalize_gate",
      reasonSummary: `Finalize gate blocked because ${needsReviewCount} review signals remain active.`,
      reasonJson: {
        needsReviewCount
      }
    });
    throw new Error("BOOK_NEEDS_REVIEW:finalize_gate");
  }

  await insertCurrentBookArtifact({
    bookId: event.bookId,
    artifactType: "pdf",
    s3Url
  });

  await execute(
    `
      UPDATE images
      SET status = 'ready'
      WHERE book_id = CAST(:bookId AS uuid) AND role = 'page_preview' AND is_current = TRUE
    `,
    [{ name: "bookId", value: { stringValue: event.bookId } }]
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

  await resolveActiveReviewCasesForBook(event.bookId, "resolved");

  return {
    ok: true,
    bookId: event.bookId,
    pdfUrl: s3Url
  };
};
