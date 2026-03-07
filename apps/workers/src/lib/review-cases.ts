import type { ReviewStage } from "@book/domain";
import { execute, query } from "./rds.js";
import { makeId } from "./helpers.js";

interface UpsertReviewCaseInput {
  bookId: string;
  orderId: string;
  stage: ReviewStage;
  reasonSummary: string;
  reasonJson?: Record<string, unknown>;
}

export async function upsertOpenReviewCase(input: UpsertReviewCaseInput): Promise<string> {
  const existing = await query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM review_cases
      WHERE book_id = CAST(:bookId AS uuid)
        AND status IN ('open', 'retrying')
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [{ name: "bookId", value: { stringValue: input.bookId } }]
  );

  if (existing[0]?.id) {
    await execute(
      `
        UPDATE review_cases
        SET status = 'open',
            stage = :stage,
            reason_summary = :reasonSummary,
            reason_json = CAST(:reasonJson AS jsonb),
            resolved_at = NULL
        WHERE id = CAST(:id AS uuid)
      `,
      [
        { name: "id", value: { stringValue: existing[0].id } },
        { name: "stage", value: { stringValue: input.stage } },
        { name: "reasonSummary", value: { stringValue: input.reasonSummary.slice(0, 1024) } },
        { name: "reasonJson", value: { stringValue: JSON.stringify(input.reasonJson ?? {}) } }
      ]
    );
    return existing[0].id;
  }

  const id = makeId();
  await execute(
    `
      INSERT INTO review_cases (id, book_id, order_id, status, stage, reason_summary, reason_json)
      VALUES (CAST(:id AS uuid), CAST(:bookId AS uuid), CAST(:orderId AS uuid), 'open', :stage, :reasonSummary, CAST(:reasonJson AS jsonb))
    `,
    [
      { name: "id", value: { stringValue: id } },
      { name: "bookId", value: { stringValue: input.bookId } },
      { name: "orderId", value: { stringValue: input.orderId } },
      { name: "stage", value: { stringValue: input.stage } },
      { name: "reasonSummary", value: { stringValue: input.reasonSummary.slice(0, 1024) } },
      { name: "reasonJson", value: { stringValue: JSON.stringify(input.reasonJson ?? {}) } }
    ]
  );
  return id;
}

export async function resolveActiveReviewCasesForBook(bookId: string, status: "resolved" | "rejected"): Promise<void> {
  await execute(
    `
      UPDATE review_cases
      SET status = :status,
          resolved_at = NOW()
      WHERE book_id = CAST(:bookId AS uuid)
        AND status IN ('open', 'retrying')
    `,
    [
      { name: "bookId", value: { stringValue: bookId } },
      { name: "status", value: { stringValue: status } }
    ]
  );
}
