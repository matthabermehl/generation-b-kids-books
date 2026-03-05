import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

interface IdempotencyClient {
  send(command: unknown): Promise<{ Item?: { response?: unknown } }>;
}

const defaultClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
let client: IdempotencyClient = defaultClient;

function tableName(): string {
  const table = process.env.IDEMPOTENCY_TABLE;
  if (!table) {
    throw new Error("IDEMPOTENCY_TABLE env var missing");
  }

  return table;
}

function ttlSeconds(): number {
  return Number(process.env.IDEMPOTENCY_TTL_SECONDS ?? "86400");
}

export async function withIdempotency<T>(
  userId: string,
  idempotencyKey: string,
  handler: () => Promise<T>
): Promise<T> {
  const table = tableName();
  const pk = `USER#${userId}`;
  const sk = `IDEMPOTENCY#${idempotencyKey}`;

  const existing = await client.send(
    new GetCommand({
      TableName: table,
      Key: { pk, sk }
    })
  );

  if (existing.Item?.response) {
    return existing.Item.response as T;
  }

  const response = await handler();
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds();

  await client.send(
    new PutCommand({
      TableName: table,
      Item: {
        pk,
        sk,
        response,
        expiresAt
      }
    })
  );

  return response;
}

export function setIdempotencyClient(nextClient: IdempotencyClient | null): void {
  client = nextClient ?? defaultClient;
}
