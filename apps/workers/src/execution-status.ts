import type { Handler } from "aws-lambda";
import { DescribeExecutionCommand, SFNClient } from "@aws-sdk/client-sfn";
import { execute } from "./lib/rds.js";

const sfn = new SFNClient({});

interface StepFunctionEventDetail {
  status?: string;
  executionArn?: string;
}

interface EventBridgeEvent {
  detail?: StepFunctionEventDetail;
}

const terminalFailureStatuses = new Set(["FAILED", "TIMED_OUT", "ABORTED"]);

export const handler: Handler<EventBridgeEvent> = async (event) => {
  const detail = event.detail;
  if (!detail?.status || !detail.executionArn) {
    return { ignored: true, reason: "missing-detail" };
  }

  if (!terminalFailureStatuses.has(detail.status)) {
    return { ignored: true, reason: "non-failure-status" };
  }

  const execution = await sfn.send(
    new DescribeExecutionCommand({
      executionArn: detail.executionArn
    })
  );

  if (!execution.input) {
    return { ignored: true, reason: "missing-execution-input" };
  }

  const parsed = JSON.parse(execution.input) as { bookId?: string; orderId?: string };
  if (!parsed.bookId) {
    return { ignored: true, reason: "missing-book-id" };
  }

  console.error(
    JSON.stringify({
      event: "StepFunctionTerminalFailure",
      executionArn: detail.executionArn,
      status: detail.status,
      bookId: parsed.bookId,
      orderId: parsed.orderId ?? null
    })
  );

  await execute(`UPDATE books SET status = 'failed' WHERE id = CAST(:bookId AS uuid)`, [
    { name: "bookId", value: { stringValue: parsed.bookId } }
  ]);

  await execute(
    `
      UPDATE orders
      SET status = 'failed'
      WHERE id = (SELECT order_id FROM books WHERE id = CAST(:bookId AS uuid) LIMIT 1)
    `,
    [{ name: "bookId", value: { stringValue: parsed.bookId } }]
  );

  return {
    handled: true,
    executionArn: detail.executionArn,
    status: detail.status,
    bookId: parsed.bookId
  };
};
