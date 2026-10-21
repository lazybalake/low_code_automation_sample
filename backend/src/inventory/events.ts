import { db, queryAll, table, type TransactItem } from '../utils/dynamodb';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { logSortKey, nextNumber, nowIso, ttlAfterDays } from './ids';

export const EVENT_TYPES = [
  'order.created',
  'order.status_changed',
  'inventory.low_stock',
  'inventory.adjusted',
  'purchase_order.created',
  'purchase_order.status_changed',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface InventoryEvent {
  id: string;
  type: EventType;
  createdAt: string;
  data: unknown;
}

interface StoredEvent extends InventoryEvent {
  stream: 'events';
  sk: string;
  expiresAt: number;
}

/**
 * The write that records an event, for the same transaction as the change it describes (an outbox): there is no change
 * without its event and no event without its change. The events table's stream then hands each new event to
 * deliverEvents (webhooks) and reorder.
 */
export async function eventPut(type: EventType, data: unknown): Promise<TransactItem> {
  const n = await nextNumber('evt');
  const createdAt = nowIso();
  const item: StoredEvent = {
    stream: 'events',
    sk: logSortKey(createdAt, n),
    id: `evt_${n}`,
    type,
    createdAt,
    data,
    expiresAt: ttlAfterDays(Number(process.env.EVENT_TTL_DAYS ?? 30)),
  };
  return { Put: { TableName: table('events'), Item: item } };
}

export const toEvent = ({ id, type, createdAt, data }: InventoryEvent): InventoryEvent => ({ id, type, createdAt, data });

/** Newest first. `after` is an ISO date: only events created after it. */
export async function listEvents({ type, after, limit }: { type?: string; after?: string; limit?: string } = {}) {
  const n = Math.min(Number(limit) || 50, 500);
  const types = type ? type.split(',').map((t) => t.trim()).filter(Boolean) : [];
  // "#~" sorts after every "#<number>" suffix, so events at exactly `after` are excluded, as "after" promises
  const keyCondition = after ? '#stream = :stream AND sk > :after' : '#stream = :stream';
  const items = await queryAll<StoredEvent>(
    {
      TableName: table('events'),
      KeyConditionExpression: keyCondition,
      ...(types.length && { FilterExpression: `#type IN (${types.map((_, i) => `:t${i}`).join(', ')})` }),
      ExpressionAttributeNames: { '#stream': 'stream', ...(types.length && { '#type': 'type' }) },
      ExpressionAttributeValues: {
        ':stream': 'events',
        ...(after && { ':after': `${after}#~` }),
        ...Object.fromEntries(types.map((t, i) => [`:t${i}`, t])),
      },
      ScanIndexForward: false,
    },
    n,
  );
  return items.map(toEvent);
}

/** The most recent events, for the demo and tests. */
export async function latestEvents(limit = 50): Promise<InventoryEvent[]> {
  const res = await db.send(
    new QueryCommand({
      TableName: table('events'),
      KeyConditionExpression: '#stream = :stream',
      ExpressionAttributeNames: { '#stream': 'stream' },
      ExpressionAttributeValues: { ':stream': 'events' },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return ((res.Items ?? []) as StoredEvent[]).map(toEvent);
}
