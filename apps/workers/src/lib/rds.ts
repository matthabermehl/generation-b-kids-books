import {
  ExecuteStatementCommand,
  RDSDataClient,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
  type Field,
  type SqlParameter
} from "@aws-sdk/client-rds-data";

const client = new RDSDataClient({});

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

export const databaseConfig = {
  clusterArn: required("DB_CLUSTER_ARN"),
  secretArn: required("DB_SECRET_ARN"),
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

function toRow<T>(record: Field[], columnNames: string[]): T {
  const row: Record<string, unknown> = {};
  columnNames.forEach((name, idx) => {
    row[name] = fieldToValue(record[idx]);
  });

  return row as T;
}

export async function query<T>(sql: string, parameters: SqlParameter[] = []): Promise<T[]> {
  const command = new ExecuteStatementCommand({
    secretArn: databaseConfig.secretArn,
    resourceArn: databaseConfig.clusterArn,
    database: databaseConfig.database,
    sql,
    parameters,
    includeResultMetadata: true
  });

  const result = await client.send(command);
  const columns = (result.columnMetadata ?? []).map((column) => column.name ?? "column");

  return (result.records ?? []).map((record) => toRow<T>(record, columns));
}

export async function execute(sql: string, parameters: SqlParameter[] = []): Promise<number> {
  const command = new ExecuteStatementCommand({
    secretArn: databaseConfig.secretArn,
    resourceArn: databaseConfig.clusterArn,
    database: databaseConfig.database,
    sql,
    parameters
  });

  const result = await client.send(command);
  return result.numberOfRecordsUpdated ?? 0;
}

export async function withTransaction<T>(fn: (transactionId: string) => Promise<T>): Promise<T> {
  const begin = await client.send(
    new BeginTransactionCommand({
      secretArn: databaseConfig.secretArn,
      resourceArn: databaseConfig.clusterArn,
      database: databaseConfig.database
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
        secretArn: databaseConfig.secretArn,
        resourceArn: databaseConfig.clusterArn,
        transactionId
      })
    );

    return result;
  } catch (error) {
    await client.send(
      new RollbackTransactionCommand({
        secretArn: databaseConfig.secretArn,
        resourceArn: databaseConfig.clusterArn,
        transactionId
      })
    );
    throw error;
  }
}

export async function txExecute(
  transactionId: string,
  sql: string,
  parameters: SqlParameter[] = []
): Promise<void> {
  await client.send(
    new ExecuteStatementCommand({
      secretArn: databaseConfig.secretArn,
      resourceArn: databaseConfig.clusterArn,
      database: databaseConfig.database,
      transactionId,
      sql,
      parameters
    })
  );
}
