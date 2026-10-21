import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { db, failedConditions, isConditionFailure, queryAll, table, transact, type TransactItem } from '../utils/dynamodb';
import { badRequest, busy, conflict, notFound } from '../utils/errors';
import * as v from '../utils/validate';
import { eventPut } from './events';
import { nextId, nowIso } from './ids';
import {
  checkLowStock,
  findProduct,
  getProductById,
  movementPut,
  releaseStock,
  reserveStock,
  shipStock,
  shortagesFor,
  type Shortage,
} from './products';

/**
 * Order lifecycle. Stock rules:
 *   create      -> reserves stock if every line is available, else "backordered" (nothing reserved)
 *   backordered -> reserved happens automatically when stock arrives (adjustment, PO received, cancellation)
 *   shipped     -> reserved units leave on-hand stock
 *   cancelled   -> any reservation is released
 */
export const ORDER_TRANSITIONS = {
  backordered: ['reserved', 'cancelled'],
  reserved: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
} as const satisfies Record<string, readonly string[]>;

export type OrderStatus = keyof typeof ORDER_TRANSITIONS;
export const ORDER_STATUSES = Object.keys(ORDER_TRANSITIONS) as OrderStatus[];
export const OPEN_ORDER_STATUSES: OrderStatus[] = ['backordered', 'reserved', 'paid'];

// A transaction holds at most 100 writes; each line takes one or two
const MAX_LINES = 40;

interface OrderLine {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Order {
  kind: 'order'; // partition key of the newest-first index
  id: string;
  externalId: string | null;
  status: OrderStatus;
  customer: { name: string; email: string };
  items: OrderLine[];
  total: number;
  currency: string;
  shortages: Shortage[];
  shipping: { carrier: string | null; trackingNumber: string | null };
  note: string | null;
  history: { status: OrderStatus; at: string; note: string | null }[];
  createdAt: string;
  updatedAt: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const presentOrder = (o: Order) => ({
  id: o.id,
  externalId: o.externalId,
  status: o.status,
  customer: o.customer,
  items: o.items,
  total: o.total,
  currency: o.currency,
  shortages: o.shortages,
  shipping: o.shipping,
  note: o.note,
  history: o.history,
  createdAt: o.createdAt,
  updatedAt: o.updatedAt,
});

// ---------- reads ----------

async function getOrder(id: string): Promise<Order | undefined> {
  const res = await db.send(new GetCommand({ TableName: table('orders'), Key: { id }, ConsistentRead: true }));
  return res.Item as Order | undefined;
}

async function findByExternalId(externalId: string): Promise<Order | undefined> {
  const claim = await db.send(new GetCommand({ TableName: table('keys'), Key: { key: `order-ext#${externalId}` }, ConsistentRead: true }));
  return claim.Item ? getOrder(claim.Item.orderId as string) : undefined;
}

/** By order ID or externalId. */
async function requireStoredOrder(ref: string): Promise<Order> {
  const o = (await getOrder(ref)) ?? (await findByExternalId(ref));
  if (!o) throw notFound(`Order "${ref}"`);
  return o;
}

export const requireOrder = async (ref: string) => presentOrder(await requireStoredOrder(ref));

export async function listOrders({ status, limit, since }: { status?: string; limit?: string; since?: string } = {}) {
  if (status && !ORDER_STATUSES.includes(status as OrderStatus)) throw badRequest(`status must be one of: ${ORDER_STATUSES.join(', ')}`);
  const n = Math.min(Number(limit) || 50, 200);
  const [index, hash, value] = status ? ['status-createdAt-index', 'status', status] : ['kind-createdAt-index', 'kind', 'order'];
  const items = await queryAll<Order>(
    {
      TableName: table('orders'),
      IndexName: index,
      KeyConditionExpression: `#hash = :hash${since ? ' AND createdAt > :since' : ''}`,
      ExpressionAttributeNames: { '#hash': hash },
      ExpressionAttributeValues: { ':hash': value, ...(since && { ':since': since }) },
      ScanIndexForward: false,
    },
    n,
  );
  return items.map(presentOrder);
}

// ---------- create ----------

export async function createOrder(input: Record<string, any>) {
  const customer = input?.customer ?? {};
  const name = v.str(customer, 'name');
  const email = v.email(customer, 'email');
  const externalId = v.str(input, 'externalId', { optional: true, max: 100 }) ?? null;
  const note = v.str(input, 'note', { optional: true, max: 1000 }) ?? null;
  if (externalId) {
    // Idempotency: automations retry. The same externalId returns the same order.
    const existing = await findByExternalId(externalId);
    if (existing) return { order: presentOrder(existing), duplicate: true };
  }
  if (!Array.isArray(input?.items) || input.items.length === 0) throw badRequest('"items" must be a non-empty array');
  if (input.items.length > MAX_LINES) throw badRequest(`An order can have at most ${MAX_LINES} lines`);

  const merged = new Map<string, OrderLine>();
  for (const [i, item] of (input.items as Record<string, unknown>[]).entries()) {
    const sku = v.str(item, 'sku', { max: 64 }).toUpperCase();
    const qty = v.int(item, 'qty', { min: 1, max: 10000 });
    const p = await findProduct(sku);
    if (!p) throw badRequest(`items[${i}]: unknown SKU ${sku}`);
    const line = merged.get(p.id);
    const total = (line?.qty ?? 0) + qty;
    merged.set(p.id, { productId: p.id, sku: p.sku, name: p.name, qty: total, unitPrice: p.price, lineTotal: round2(p.price * total) });
  }
  const items = [...merged.values()];

  const id = await nextId('ord');
  const createdAt = nowIso();
  // Read stock, then write the order with reservations that only commit if that stock is still there. If another
  // order took it in between, read again: the order either reserves everything or waits as a backorder.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const products = await Promise.all(items.map((it) => getProductById(it.productId)));
    const shortages = shortagesFor(items, products);
    const status: OrderStatus = shortages.length ? 'backordered' : 'reserved';
    const order: Order = {
      kind: 'order',
      id,
      externalId,
      status,
      customer: { name, email },
      items,
      total: round2(items.reduce((s, it) => s + it.lineTotal, 0)),
      currency: process.env.CURRENCY || 'USD',
      shortages,
      shipping: { carrier: null, trackingNumber: null },
      note,
      history: [{ status, at: createdAt, note: 'Order created' }],
      createdAt,
      updatedAt: createdAt,
    };

    const writes: TransactItem[] = [{ Put: { TableName: table('orders'), Item: order } }];
    if (externalId) {
      writes.push({
        Put: {
          TableName: table('keys'),
          Item: { key: `order-ext#${externalId}`, orderId: id },
          ConditionExpression: 'attribute_not_exists(#key)',
          ExpressionAttributeNames: { '#key': 'key' },
        },
      });
    }
    const firstReservation = writes.length;
    if (status === 'reserved') writes.push(...items.map((it) => reserveStock(it.productId, it.qty)));
    writes.push(await eventPut('order.created', presentOrder(order)));

    try {
      await transact(writes);
    } catch (error) {
      const failed = failedConditions(error);
      if (!failed) throw error;
      if (externalId && failed[1]) {
        // The same externalId arrived twice at once and the other request won
        const existing = await findByExternalId(externalId);
        if (existing) return { order: presentOrder(existing), duplicate: true };
      }
      if (failed.slice(firstReservation).some(Boolean)) continue;
      throw error;
    }
    for (const it of items) await checkLowStock(it.productId);
    return { order: presentOrder(order), duplicate: false };
  }
  throw busy('Stock for this order kept changing while it was placed; retry in a moment');
}

// ---------- status changes ----------

export async function setOrderStatus(ref: string, input: Record<string, unknown>) {
  const order = await requireStoredOrder(ref);
  const to = v.oneOf(input, 'status', ORDER_STATUSES);
  const note = v.str(input, 'note', { optional: true, max: 1000 }) ?? null;
  const from = order.status;
  if (from === to) return presentOrder(order); // a retried automation changes nothing
  if (!(ORDER_TRANSITIONS[from] as readonly OrderStatus[]).includes(to)) {
    throw conflict(`Order ${order.id} cannot go from "${from}" to "${to}"`, { allowed: ORDER_TRANSITIONS[from] });
  }

  const at = nowIso();
  const next: Order = { ...order, status: to, updatedAt: at, history: [...order.history, { status: to, at, note }] };
  const stock: TransactItem[] = [];

  if (to === 'reserved') {
    const shortages = shortagesFor(order.items, await Promise.all(order.items.map((it) => getProductById(it.productId))));
    if (shortages.length) {
      await saveShortages(order.id, from, shortages);
      throw conflict(`Not enough stock to reserve order ${order.id}`, { shortages });
    }
    next.shortages = [];
    stock.push(...order.items.map((it) => reserveStock(it.productId, it.qty)));
  }
  if (to === 'shipped') {
    next.shipping = {
      carrier: v.str(input, 'carrier', { optional: true }) ?? order.shipping.carrier,
      trackingNumber: v.str(input, 'trackingNumber', { optional: true }) ?? order.shipping.trackingNumber,
    };
    for (const it of order.items) {
      stock.push(shipStock(it.productId, it.qty), await movementPut({ id: it.productId, sku: it.sku }, -it.qty, 'shipped', order.id, at));
    }
  }
  if (to === 'cancelled' && (from === 'reserved' || from === 'paid')) {
    stock.push(...order.items.map((it) => releaseStock(it.productId, it.qty)));
  }

  try {
    await transact([
      // Only if nobody changed the order since it was read
      {
        Put: {
          TableName: table('orders'),
          Item: next,
          ConditionExpression: '#status = :from',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':from': from },
        },
      },
      ...stock,
      await eventPut('order.status_changed', { from, to, order: presentOrder(next) }),
    ]);
  } catch (error) {
    const failed = failedConditions(error);
    if (!failed) throw error;
    if (failed[0]) throw conflict(`Order ${order.id} changed while this request ran; read it again and retry`);
    const shortages = shortagesFor(order.items, await Promise.all(order.items.map((it) => getProductById(it.productId))));
    throw conflict(`Not enough stock to reserve order ${order.id}`, { shortages });
  }

  if (to === 'cancelled') await allocateBackorders(); // freed stock may cover a waiting order
  for (const it of order.items) await checkLowStock(it.productId);
  return presentOrder(next);
}

async function saveShortages(id: string, status: OrderStatus, shortages: Shortage[]): Promise<void> {
  try {
    await db.send(
      new UpdateCommand({
        TableName: table('orders'),
        Key: { id },
        UpdateExpression: 'SET shortages = :shortages',
        ConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':shortages': shortages, ':status': status },
      }),
    );
  } catch (error) {
    if (!isConditionFailure(error)) throw error;
  }
}

/** First come, first served: reserve the backordered orders that stock now covers, oldest first. */
export async function allocateBackorders(): Promise<void> {
  const waiting = await queryAll<Order>({
    TableName: table('orders'),
    IndexName: 'status-createdAt-index',
    KeyConditionExpression: '#status = :status',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':status': 'backordered' },
    ScanIndexForward: true,
  });

  for (const order of waiting) {
    const shortages = shortagesFor(order.items, await Promise.all(order.items.map((it) => getProductById(it.productId))));
    if (shortages.length) {
      if (JSON.stringify(shortages) !== JSON.stringify(order.shortages)) await saveShortages(order.id, 'backordered', shortages);
      continue;
    }
    const at = nowIso();
    const note = 'Stock arrived, auto-allocated';
    const next: Order = { ...order, status: 'reserved', shortages: [], updatedAt: at, history: [...order.history, { status: 'reserved', at, note }] };
    try {
      await transact([
        {
          Put: {
            TableName: table('orders'),
            Item: next,
            ConditionExpression: '#status = :backordered',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':backordered': 'backordered' },
          },
        },
        ...order.items.map((it) => reserveStock(it.productId, it.qty)),
        await eventPut('order.status_changed', { from: 'backordered', to: 'reserved', order: presentOrder(next) }),
      ]);
    } catch (error) {
      // Another request allocated it or took the stock first; the next stock increase looks again
      if (!failedConditions(error)) throw error;
      continue;
    }
    for (const it of order.items) await checkLowStock(it.productId);
  }
}

/** Orders per status, for the report. */
export async function countOrdersByStatus(): Promise<Record<OrderStatus, number>> {
  const counts = await Promise.all(
    ORDER_STATUSES.map(async (status) => {
      let count = 0;
      let ExclusiveStartKey: Record<string, unknown> | undefined;
      do {
        const page = await db.send(
          new QueryCommand({
            TableName: table('orders'),
            IndexName: 'status-createdAt-index',
            KeyConditionExpression: '#status = :status',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':status': status },
            Select: 'COUNT',
            ExclusiveStartKey,
          }),
        );
        count += page.Count ?? 0;
        ExclusiveStartKey = page.LastEvaluatedKey;
      } while (ExclusiveStartKey);
      return [status, count] as const;
    }),
  );
  return Object.fromEntries(counts) as Record<OrderStatus, number>;
}
