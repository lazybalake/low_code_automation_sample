import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { db, failedConditions, isConditionFailure, queryAll, scanAll, table, transact, type TransactItem } from '../utils/dynamodb';
import { badRequest, conflict, notFound } from '../utils/errors';
import * as v from '../utils/validate';
import { eventPut } from './events';
import { logSortKey, nextId, nextNumber, nowIso, ttlAfterDays } from './ids';
import { allocateBackorders } from './orders';

/**
 * As stored. available (onHand - reserved) is stored too, because a DynamoDB condition can't do arithmetic:
 * "reserve 3 if available >= 3" has to compare a stored attribute. Every stock write updates both.
 */
export interface Product {
  id: string;
  sku: string;
  name: string;
  price: number;
  onHand: number;
  reserved: number;
  available: number;
  reorderPoint: number;
  reorderQty: number;
  supplier: string | null;
  lowStockAlerted: boolean;
  // The one open purchase order low-stock and backorder restocks share (purchaseOrders.ts)
  openPurchaseOrderId?: string;
  createdAt: string;
  updatedAt: string;
}

export const presentProduct = (p: Product) => ({
  id: p.id,
  sku: p.sku,
  name: p.name,
  price: p.price,
  onHand: p.onHand,
  reserved: p.reserved,
  available: p.available,
  lowStock: p.available <= p.reorderPoint,
  reorderPoint: p.reorderPoint,
  reorderQty: p.reorderQty,
  supplier: p.supplier,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

// ---------- reads ----------

export async function getProductById(id: string): Promise<Product | undefined> {
  const res = await db.send(new GetCommand({ TableName: table('products'), Key: { id }, ConsistentRead: true }));
  return res.Item as Product | undefined;
}

/** By product ID or SKU (any case). */
export async function findProduct(ref: string): Promise<Product | undefined> {
  const key = String(ref).trim();
  if (/^prd_\d+$/.test(key)) {
    const byId = await getProductById(key);
    if (byId) return byId;
  }
  const claim = await db.send(new GetCommand({ TableName: table('keys'), Key: { key: `sku#${key.toUpperCase()}` }, ConsistentRead: true }));
  return claim.Item ? getProductById(claim.Item.productId as string) : undefined;
}

export async function requireProduct(ref: string): Promise<Product> {
  const p = await findProduct(ref);
  if (!p) throw notFound(`Product "${ref}"`);
  return p;
}

export async function listProducts({ sku, lowStock }: { sku?: string; lowStock?: string | boolean } = {}) {
  // A catalog is small enough to scan; a large one would page through it instead
  let list = await scanAll<Product>({ TableName: table('products'), ConsistentRead: true });
  list.sort((a, b) => Number(a.id.split('_')[1]) - Number(b.id.split('_')[1]));
  if (sku) list = list.filter((p) => p.sku === String(sku).toUpperCase());
  let out = list.map(presentProduct);
  if (lowStock === 'true' || lowStock === true) out = out.filter((p) => p.lowStock);
  return out;
}

// ---------- writes ----------

export async function createProduct(input: Record<string, unknown>, { silent = false } = {}) {
  const sku = v.str(input, 'sku', { max: 64 }).toUpperCase();
  const onHand = v.int(input, 'onHand', { optional: true, min: 0 }) ?? 0;
  const at = nowIso();
  const p: Product = {
    id: '',
    sku,
    name: v.str(input, 'name'),
    price: v.money(input, 'price'),
    onHand,
    reserved: 0,
    available: onHand,
    reorderPoint: v.int(input, 'reorderPoint', { optional: true, min: 0 }) ?? 0,
    reorderQty: v.int(input, 'reorderQty', { optional: true, min: 1 }) ?? 1,
    supplier: v.str(input, 'supplier', { optional: true }) ?? null,
    lowStockAlerted: false,
    createdAt: at,
    updatedAt: at,
  };
  if (await findProduct(sku)) throw conflict(`SKU ${sku} already exists`);
  p.id = await nextId('prd');
  try {
    await transact([
      // Claiming the SKU in the same transaction keeps it unique even when two requests race
      {
        Put: {
          TableName: table('keys'),
          Item: { key: `sku#${sku}`, productId: p.id },
          ConditionExpression: 'attribute_not_exists(#key)',
          ExpressionAttributeNames: { '#key': 'key' },
        },
      },
      { Put: { TableName: table('products'), Item: p } },
    ]);
  } catch (error) {
    if (failedConditions(error)?.[0]) throw conflict(`SKU ${sku} already exists`);
    throw error;
  }
  if (!silent) await checkLowStock(p.id);
  return presentProduct(p);
}

export async function updateProduct(ref: string, input: Record<string, unknown>) {
  const p = await requireProduct(ref);
  if (input?.onHand !== undefined) throw badRequest('Change stock with POST /api/products/:ref/adjust');
  const fields = Object.entries({
    name: v.str(input, 'name', { optional: true }),
    price: v.money(input, 'price', { optional: true }),
    reorderPoint: v.int(input, 'reorderPoint', { optional: true, min: 0 }),
    reorderQty: v.int(input, 'reorderQty', { optional: true, min: 1 }),
    supplier: v.str(input, 'supplier', { optional: true }),
  }).filter(([, val]) => val !== undefined);
  fields.push(['updatedAt', nowIso()]);

  const res = await db.send(
    new UpdateCommand({
      TableName: table('products'),
      Key: { id: p.id },
      UpdateExpression: `SET ${fields.map(([k]) => `#${k} = :${k}`).join(', ')}`,
      ExpressionAttributeNames: Object.fromEntries(fields.map(([k]) => [`#${k}`, k])),
      ExpressionAttributeValues: Object.fromEntries(fields.map(([k, val]) => [`:${k}`, val])),
      ReturnValues: 'ALL_NEW',
    }),
  );
  await checkLowStock(p.id);
  return presentProduct(res.Attributes as Product);
}

export async function adjustStock(ref: string, input: Record<string, unknown>) {
  const p = await requireProduct(ref);
  const delta = v.int(input, 'delta', { min: -1e6, max: 1e6 });
  if (delta === 0) throw badRequest('"delta" cannot be 0');
  const reason = v.str(input, 'reason', { optional: true }) ?? 'manual';
  const at = nowIso();
  // The event carries the product as this change leaves it, worked out from the read above
  const after: Product = { ...p, onHand: p.onHand + delta, available: p.available + delta, updatedAt: at };

  try {
    await transact([
      {
        Update: {
          TableName: table('products'),
          Key: { id: p.id },
          UpdateExpression: 'SET onHand = onHand + :delta, available = available + :delta, updatedAt = :at',
          // Stock promised to orders can't be removed
          ConditionExpression: delta < 0 ? 'available >= :need' : 'attribute_exists(id)',
          ExpressionAttributeValues: { ':delta': delta, ':at': at, ...(delta < 0 && { ':need': -delta }) },
        },
      },
      await movementPut(p, delta, reason, null, at),
      await eventPut('inventory.adjusted', { product: presentProduct(after), delta, reason }),
    ]);
  } catch (error) {
    if (!failedConditions(error)?.[0]) throw error;
    const now = await requireProduct(p.id);
    throw conflict(`Cannot remove ${-delta} units of ${p.sku}: ${now.reserved} are reserved for orders`, {
      onHand: now.onHand,
      reserved: now.reserved,
    });
  }
  await checkLowStock(p.id);
  if (delta > 0) await allocateBackorders();
  return presentProduct((await getProductById(p.id))!);
}

/**
 * Edge-triggered: inventory.low_stock fires once when available stock drops to the reorder point, and re-arms when it
 * climbs back above. The flag flips under a condition, so two requests crossing the line together still raise one alert.
 */
export async function checkLowStock(productId: string): Promise<void> {
  const p = await getProductById(productId);
  if (!p) return;
  const isLow = p.available <= p.reorderPoint;
  if (isLow && !p.lowStockAlerted) {
    try {
      await transact([
        {
          Update: {
            TableName: table('products'),
            Key: { id: p.id },
            UpdateExpression: 'SET lowStockAlerted = :true',
            ConditionExpression: 'lowStockAlerted = :false',
            ExpressionAttributeValues: { ':true': true, ':false': false },
          },
        },
        await eventPut('inventory.low_stock', {
          product: presentProduct(p),
          suggestedReorderQty: Math.max(p.reorderQty, p.reorderPoint - p.available + 1),
          openPurchaseOrderId: p.openPurchaseOrderId ?? null,
        }),
      ]);
    } catch (error) {
      if (!failedConditions(error)) throw error; // another request raised it first
    }
  } else if (!isLow && p.lowStockAlerted) {
    try {
      await db.send(
        new UpdateCommand({
          TableName: table('products'),
          Key: { id: p.id },
          UpdateExpression: 'SET lowStockAlerted = :false',
          ConditionExpression: 'lowStockAlerted = :true',
          ExpressionAttributeValues: { ':true': true, ':false': false },
        }),
      );
    } catch (error) {
      if (!isConditionFailure(error)) throw error;
    }
  }
}

// ---------- stock writes for order and purchase-order transactions ----------

const stockUpdate = (productId: string, expression: string, values: Record<string, unknown>, condition?: string): TransactItem => ({
  Update: {
    TableName: table('products'),
    Key: { id: productId },
    UpdateExpression: `${expression}, updatedAt = :at`,
    ConditionExpression: condition ?? 'attribute_exists(id)',
    ExpressionAttributeValues: { ...values, ':at': nowIso() },
  },
});

/** Fails the whole transaction unless `qty` is still available when it commits. */
export const reserveStock = (productId: string, qty: number) =>
  stockUpdate(productId, 'SET reserved = reserved + :qty, available = available - :qty', { ':qty': qty }, 'available >= :qty');

export const releaseStock = (productId: string, qty: number) =>
  stockUpdate(productId, 'SET reserved = reserved - :qty, available = available + :qty', { ':qty': qty });

/** Reserved units leave the warehouse: on hand and reserved both drop, available is unchanged. */
export const shipStock = (productId: string, qty: number) =>
  stockUpdate(productId, 'SET reserved = reserved - :qty, onHand = onHand - :qty', { ':qty': qty });

export const receiveStock = (productId: string, qty: number) =>
  stockUpdate(productId, 'SET onHand = onHand + :qty, available = available + :qty', { ':qty': qty });

export interface Shortage {
  sku: string;
  requested: number;
  available: number;
  short: number;
}

export function shortagesFor(lines: { productId: string; sku: string; qty: number }[], products: (Product | undefined)[]): Shortage[] {
  return lines
    .map((line, i) => {
      const available = Math.max(products[i]?.available ?? 0, 0);
      return { sku: line.sku, requested: line.qty, available, short: line.qty - available };
    })
    .filter((s) => s.short > 0);
}

// ---------- stock movement history ----------

interface Movement {
  id: string;
  productId: string;
  sku: string;
  delta: number;
  reason: string;
  ref: string | null;
  at: string;
}

export async function movementPut(p: Pick<Product, 'id' | 'sku'>, delta: number, reason: string, ref: string | null, at = nowIso()): Promise<TransactItem> {
  const n = await nextNumber('mov');
  const item: Movement & { stream: string; sk: string; expiresAt: number } = {
    stream: 'movements',
    sk: logSortKey(at, n),
    id: `mov_${n}`,
    productId: p.id,
    sku: p.sku,
    delta,
    reason,
    ref,
    at,
    expiresAt: ttlAfterDays(365),
  };
  return { Put: { TableName: table('movements'), Item: item } };
}

export async function listMovements({ sku, limit }: { sku?: string; limit?: string } = {}): Promise<Movement[]> {
  const n = Math.min(Number(limit) || 100, 500);
  const items = await queryAll<Movement & { stream: string; sk: string; expiresAt: number }>(
    {
      TableName: table('movements'),
      KeyConditionExpression: '#stream = :stream',
      ...(sku && { FilterExpression: 'sku = :sku' }),
      ExpressionAttributeNames: { '#stream': 'stream' },
      ExpressionAttributeValues: { ':stream': 'movements', ...(sku && { ':sku': String(sku).toUpperCase() }) },
      ScanIndexForward: false,
    },
    n,
  );
  return items.map(({ id, productId, sku: s, delta, reason, ref, at }) => ({ id, productId, sku: s, delta, reason, ref, at }));
}
