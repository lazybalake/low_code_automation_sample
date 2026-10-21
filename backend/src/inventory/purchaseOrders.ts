import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { db, failedConditions, isConditionFailure, queryAll, table, transact, type TransactItem } from '../utils/dynamodb';
import { conflict, notFound } from '../utils/errors';
import * as v from '../utils/validate';
import { eventPut } from './events';
import { nextId, nowIso } from './ids';
import { allocateBackorders } from './orders';
import { checkLowStock, getProductById, movementPut, receiveStock, requireProduct } from './products';

export const PO_TRANSITIONS = {
  requested: ['ordered', 'received', 'cancelled'],
  ordered: ['received', 'cancelled'],
  received: [],
  cancelled: [],
} as const satisfies Record<string, readonly string[]>;

export type PoStatus = keyof typeof PO_TRANSITIONS;
export const PO_STATUSES = Object.keys(PO_TRANSITIONS) as PoStatus[];
export const OPEN_PO_STATUSES: PoStatus[] = ['requested', 'ordered'];

export interface PurchaseOrder {
  kind: 'purchaseOrder'; // partition key of the newest-first index
  id: string;
  productId: string;
  sku: string;
  productName: string;
  qty: number;
  supplier: string | null;
  reason: string;
  status: PoStatus;
  history: { status: PoStatus; at: string; note: string | null }[];
  createdAt: string;
  updatedAt: string;
}

export const presentPurchaseOrder = (po: PurchaseOrder) => ({
  id: po.id,
  productId: po.productId,
  sku: po.sku,
  productName: po.productName,
  qty: po.qty,
  supplier: po.supplier,
  reason: po.reason,
  status: po.status,
  history: po.history,
  createdAt: po.createdAt,
  updatedAt: po.updatedAt,
});

async function getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
  const res = await db.send(new GetCommand({ TableName: table('purchaseOrders'), Key: { id }, ConsistentRead: true }));
  return res.Item as PurchaseOrder | undefined;
}

async function requireStoredPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const po = await getPurchaseOrder(id);
  if (!po) throw notFound(`Purchase order "${id}"`);
  return po;
}

export const requirePurchaseOrder = async (id: string) => presentPurchaseOrder(await requireStoredPurchaseOrder(id));

/** Newest first. status is one status, or "open" for requested and ordered. */
export async function listPurchaseOrders({ status, sku }: { status?: string; sku?: string } = {}) {
  let list = await queryAll<PurchaseOrder>({
    TableName: table('purchaseOrders'),
    IndexName: 'kind-createdAt-index',
    KeyConditionExpression: 'kind = :kind',
    ExpressionAttributeValues: { ':kind': 'purchaseOrder' },
    ScanIndexForward: false,
  });
  if (status === 'open') list = list.filter((po) => OPEN_PO_STATUSES.includes(po.status));
  else if (status) list = list.filter((po) => po.status === status);
  if (sku) list = list.filter((po) => po.sku === String(sku).toUpperCase());
  return list.map(presentPurchaseOrder);
}

/** The product's open purchase order, if its marker still points at one. */
async function openPurchaseOrderFor(productId: string): Promise<PurchaseOrder | undefined> {
  const p = await getProductById(productId);
  const po = p?.openPurchaseOrderId ? await getPurchaseOrder(p.openPurchaseOrderId) : undefined;
  return po && OPEN_PO_STATUSES.includes(po.status) ? po : undefined;
}

export async function createPurchaseOrder(input: Record<string, unknown>) {
  const p = await requireProduct(v.str(input, 'sku', { max: 64 }));
  // qty = exact amount. atLeast = "the shortfall, or the usual reorder size if that's bigger".
  const atLeast = v.int(input, 'atLeast', { optional: true, min: 1, max: 1e6 });
  const qty = v.int(input, 'qty', { optional: true, min: 1, max: 1e6 }) ?? Math.max(atLeast ?? 0, p.reorderQty);
  const reason = v.str(input, 'reason', { optional: true }) ?? 'manual';
  const supplier = v.str(input, 'supplier', { optional: true }) ?? p.supplier;
  const dedupe = input?.dedupe !== false && input?.dedupe !== 'false';

  if (dedupe) {
    // Low-stock alerts and backorders can both ask for the same restock; keep one open PO per product
    const open = await openPurchaseOrderFor(p.id);
    if (open) return { purchaseOrder: presentPurchaseOrder(open), duplicate: true };
  }

  const at = nowIso();
  const po: PurchaseOrder = {
    kind: 'purchaseOrder',
    id: await nextId('po'),
    productId: p.id,
    sku: p.sku,
    productName: p.name,
    qty,
    supplier,
    reason,
    status: 'requested',
    history: [{ status: 'requested', at, note: reason }],
    createdAt: at,
    updatedAt: at,
  };

  // The product's openPurchaseOrderId marker is the "one open PO" lock. With dedupe it must still be what was read
  // (absent, or pointing at a PO that has since closed), so two concurrent requests can't both create one.
  const marker: TransactItem = dedupe
    ? {
        Update: {
          TableName: table('products'),
          Key: { id: p.id },
          UpdateExpression: 'SET openPurchaseOrderId = :id',
          ConditionExpression: p.openPurchaseOrderId ? 'openPurchaseOrderId = :seen' : 'attribute_not_exists(openPurchaseOrderId)',
          ExpressionAttributeValues: { ':id': po.id, ...(p.openPurchaseOrderId && { ':seen': p.openPurchaseOrderId }) },
        },
      }
    : {
        Update: {
          TableName: table('products'),
          Key: { id: p.id },
          UpdateExpression: 'SET openPurchaseOrderId = if_not_exists(openPurchaseOrderId, :id)',
          ExpressionAttributeValues: { ':id': po.id },
        },
      };

  try {
    await transact([{ Put: { TableName: table('purchaseOrders'), Item: po } }, marker, await eventPut('purchase_order.created', presentPurchaseOrder(po))]);
  } catch (error) {
    if (!failedConditions(error)?.[1]) throw error;
    const open = await openPurchaseOrderFor(p.id);
    if (open) return { purchaseOrder: presentPurchaseOrder(open), duplicate: true };
    throw conflict(`Another purchase order for ${p.sku} was being created at the same time; retry`);
  }
  return { purchaseOrder: presentPurchaseOrder(po), duplicate: false };
}

export async function setPurchaseOrderStatus(id: string, input: Record<string, unknown>) {
  const po = await requireStoredPurchaseOrder(id);
  const to = v.oneOf(input, 'status', PO_STATUSES);
  const note = v.str(input, 'note', { optional: true, max: 1000 }) ?? null;
  const from = po.status;
  if (from === to) return presentPurchaseOrder(po);
  if (!(PO_TRANSITIONS[from] as readonly PoStatus[]).includes(to)) {
    throw conflict(`Purchase order ${po.id} cannot go from "${from}" to "${to}"`, { allowed: PO_TRANSITIONS[from] });
  }

  const at = nowIso();
  const next: PurchaseOrder = { ...po, status: to, updatedAt: at, history: [...po.history, { status: to, at, note }] };
  const stock: TransactItem[] =
    to === 'received'
      ? [receiveStock(po.productId, po.qty), await movementPut({ id: po.productId, sku: po.sku }, po.qty, 'purchase_order_received', po.id, at)]
      : [];

  try {
    await transact([
      {
        Put: {
          TableName: table('purchaseOrders'),
          Item: next,
          ConditionExpression: '#status = :from',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':from': from },
        },
      },
      ...stock,
      await eventPut('purchase_order.status_changed', { from, to, purchaseOrder: presentPurchaseOrder(next) }),
    ]);
  } catch (error) {
    if (failedConditions(error)?.[0]) throw conflict(`Purchase order ${po.id} changed while this request ran; read it again and retry`);
    throw error;
  }

  if (to === 'received' || to === 'cancelled') await releaseMarker(po);
  if (to === 'received') {
    await checkLowStock(po.productId);
    await allocateBackorders();
  }
  return presentPurchaseOrder(next);
}

/** A closed PO stops being the product's open one (unless another PO holds the marker). */
async function releaseMarker(po: PurchaseOrder): Promise<void> {
  try {
    await db.send(
      new UpdateCommand({
        TableName: table('products'),
        Key: { id: po.productId },
        UpdateExpression: 'REMOVE openPurchaseOrderId',
        ConditionExpression: 'openPurchaseOrderId = :id',
        ExpressionAttributeValues: { ':id': po.id },
      }),
    );
  } catch (error) {
    if (!isConditionFailure(error)) throw error;
  }
}
