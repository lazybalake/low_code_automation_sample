import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { db, table } from '../utils/dynamodb';

export const nowIso = () => new Date().toISOString();

/** The next number of a counter (1001, 1002, ...). Atomic, so concurrent Lambdas never share one. */
export async function nextNumber(prefix: string): Promise<number> {
  const res = await db.send(
    new UpdateCommand({
      TableName: table('keys'),
      Key: { key: `counter#${prefix}` },
      UpdateExpression: 'SET #value = if_not_exists(#value, :start) + :one',
      ExpressionAttributeNames: { '#value': 'value' },
      ExpressionAttributeValues: { ':start': 1000, ':one': 1 },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  return res.Attributes!.value as number;
}

/** ord_1001, prd_1006, po_1002... A failed write leaves a gap in the sequence, which is harmless. */
export const nextId = async (prefix: string) => `${prefix}_${await nextNumber(prefix)}`;

/** Sort key for the append-only logs: time first, then the zero-padded number so equal timestamps keep their order. */
export const logSortKey = (at: string, n: number) => `${at}#${String(n).padStart(12, '0')}`;

export const ttlAfterDays = (days: number) => Math.floor(Date.now() / 1000) + days * 86_400;
