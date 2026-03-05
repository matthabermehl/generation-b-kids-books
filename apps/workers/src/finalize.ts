import type { Handler } from "aws-lambda";
import { execute } from "./lib/rds.js";
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
