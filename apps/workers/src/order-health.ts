import type { Handler } from "aws-lambda";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { query } from "./lib/rds.js";

const cloudwatch = new CloudWatchClient({});

interface StuckRow {
  stuck_count: number;
}

export const handler: Handler = async () => {
  const thresholdMinutes = Number(process.env.ORDER_STUCK_MINUTES ?? "45");
  const rows = await query<StuckRow>(
    `
      SELECT COUNT(*)::int AS stuck_count
      FROM orders
      WHERE status IN ('paid', 'building')
        AND created_at < (NOW() - CAST(:window AS interval))
    `,
    [{ name: "window", value: { stringValue: `${thresholdMinutes} minutes` } }]
  );

  const stuckCount = Number(rows[0]?.stuck_count ?? 0);

  await cloudwatch.send(
    new PutMetricDataCommand({
      Namespace: "AiChildrensBook",
      MetricData: [
        {
          MetricName: "OrderStuckCount",
          Timestamp: new Date(),
          Unit: "Count",
          Value: stuckCount
        }
      ]
    })
  );

  console.log(
    JSON.stringify({
      event: "ORDER_HEALTH_STUCK_COUNT",
      thresholdMinutes,
      stuckCount
    })
  );

  return {
    ok: true,
    thresholdMinutes,
    stuckCount
  };
};
