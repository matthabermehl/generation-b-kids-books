import type { Handler } from "aws-lambda";
import { query } from "./lib/rds.js";

interface Event {
  bookId: string;
}

interface Row {
  total: number;
  ready: number;
  failed: number;
}

export const handler: Handler<Event> = async (event) => {
  if (!event?.bookId) {
    throw new Error("bookId is required");
  }

  const rows = await query<Row>(
    `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'ready')::int AS ready,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
      FROM pages
      WHERE book_id = CAST(:bookId AS uuid)
    `,
    [{ name: "bookId", value: { stringValue: event.bookId } }]
  );

  const row = rows[0] ?? { total: 0, ready: 0, failed: 0 };
  const total = Number(row.total);
  const ready = Number(row.ready);
  const failed = Number(row.failed);

  return {
    bookId: event.bookId,
    total,
    ready,
    failed,
    pending: Math.max(total - ready - failed, 0),
    done: total > 0 && ready === total
  };
};
