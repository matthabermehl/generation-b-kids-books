import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
  type Field,
  type SqlParameter
} from "@aws-sdk/client-rds-data";
import { requiredEnv } from "./env.js";

const client = new RDSDataClient({});

const config = {
  clusterArn: requiredEnv("DB_CLUSTER_ARN"),
  secretArn: requiredEnv("DB_SECRET_ARN"),
  database: process.env.DB_NAME ?? "bookapp"
};

function fieldToValue(field?: Field): unknown {
  if (!field) return null;
  if (field.isNull) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.longValue !== undefined) return field.longValue;
  if (field.doubleValue !== undefined) return field.doubleValue;

  return null;
}

function toRows<T>(records: Field[][], columns: string[]): T[] {
  return records.map((record) => {
    const row: Record<string, unknown> = {};
    columns.forEach((column, idx) => {
      row[column] = fieldToValue(record[idx]);
    });
    return row as T;
  });
}

export async function query<T>(sql: string, parameters: SqlParameter[] = []): Promise<T[]> {
  const response = await client.send(
    new ExecuteStatementCommand({
      secretArn: config.secretArn,
      resourceArn: config.clusterArn,
      database: config.database,
      sql,
      parameters,
      includeResultMetadata: true
    })
  );

  const columns = (response.columnMetadata ?? []).map((metadata) => metadata.name ?? "column");
  return toRows<T>(response.records ?? [], columns);
}

export async function execute(sql: string, parameters: SqlParameter[] = []): Promise<number> {
  const response = await client.send(
    new ExecuteStatementCommand({
      secretArn: config.secretArn,
      resourceArn: config.clusterArn,
      database: config.database,
      sql,
      parameters
    })
  );

  return response.numberOfRecordsUpdated ?? 0;
}

export async function withTransaction<T>(fn: (transactionId: string) => Promise<T>): Promise<T> {
  const begin = await client.send(
    new BeginTransactionCommand({
      secretArn: config.secretArn,
      resourceArn: config.clusterArn,
      database: config.database
    })
  );

  const transactionId = begin.transactionId;
  if (!transactionId) {
    throw new Error("Could not start transaction");
  }

  try {
    const result = await fn(transactionId);
    await client.send(
      new CommitTransactionCommand({
        secretArn: config.secretArn,
        resourceArn: config.clusterArn,
        transactionId
      })
    );
    return result;
  } catch (error) {
    await client.send(
      new RollbackTransactionCommand({
        secretArn: config.secretArn,
        resourceArn: config.clusterArn,
        transactionId
      })
    );
    throw error;
  }
}

export async function txExecute(transactionId: string, sql: string, parameters: SqlParameter[] = []): Promise<void> {
  await client.send(
    new ExecuteStatementCommand({
      secretArn: config.secretArn,
      resourceArn: config.clusterArn,
      database: config.database,
      transactionId,
      sql,
      parameters
    })
  );
}
