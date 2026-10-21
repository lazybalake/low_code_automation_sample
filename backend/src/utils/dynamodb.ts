import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  type QueryCommandInput,
  type ScanCommandInput,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { TABLES } from '../../resources/tables.cjs';
import { busy } from './errors';

// DYNAMODB_ENDPOINT points at DynamoDB Local (npm run dev, tests). Its fixed fake keys mean a local run can never
// write to a real AWS table, even when the shell has AWS credentials. Deployed functions leave it unset.
const endpoint = process.env.DYNAMODB_ENDPOINT;
const client = new DynamoDBClient(
  endpoint
    ? { endpoint, region: process.env.AWS_REGION ?? 'us-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }
    : {},
);

export const db = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

export type TableKey = keyof typeof TABLES;

// Read on every call: tests switch TABLE_PREFIX to give each test fresh tables
export const table = (key: TableKey): string => `${process.env.TABLE_PREFIX}-${TABLES[key].name}`;

export type TransactItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number];

/**
 * Runs the writes as one transaction: all of them happen or none do. DynamoDB refuses a transaction that overlaps
 * another one in flight (TransactionConflict); those are retried here, so callers only see their own failed conditions.
 */
export async function transact(items: TransactItem[]): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await db.send(new TransactWriteCommand({ TransactItems: items }));
      return;
    } catch (error) {
      const codes = cancellationCodes(error);
      if (!codes?.includes('TransactionConflict')) throw error;
      if (attempt === 4) throw busy('Other requests are changing the same records; retry in a moment');
      await new Promise((r) => setTimeout(r, 25 * 2 ** attempt + Math.random() * 25));
    }
  }
}

function cancellationCodes(error: unknown): string[] | null {
  if ((error as Error)?.name !== 'TransactionCanceledException') return null;
  const reasons = (error as { CancellationReasons?: { Code?: string }[] }).CancellationReasons ?? [];
  return reasons.map((r) => r.Code ?? 'None');
}

/**
 * For a transaction that failed because of its own conditions: one flag per item, true where that item's condition
 * failed. null for any other error, which the caller should rethrow.
 */
export function failedConditions(error: unknown): boolean[] | null {
  const codes = cancellationCodes(error);
  return codes && codes.includes('ConditionalCheckFailed') ? codes.map((c) => c === 'ConditionalCheckFailed') : null;
}

export const isConditionFailure = (error: unknown) => (error as Error)?.name === 'ConditionalCheckFailedException';

/** Every page of a query (one page stops at 1 MB), or until `max` items. */
export async function queryAll<T>(input: QueryCommandInput, max = Infinity): Promise<T[]> {
  const items: T[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(new QueryCommand({ ...input, ExclusiveStartKey }));
    items.push(...((page.Items ?? []) as T[]));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey && items.length < max);
  return items.slice(0, max);
}

export async function scanAll<T>(input: ScanCommandInput): Promise<T[]> {
  const items: T[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(new ScanCommand({ ...input, ExclusiveStartKey }));
    items.push(...((page.Items ?? []) as T[]));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}
