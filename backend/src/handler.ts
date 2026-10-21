import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { db, nextId, type Order, type PurchaseOrder } from './mockData';

// The whole API: one Lambda function. API Gateway matches the route (serverless.yml) and passes its key, e.g.
// "GET /api/orders/{id}", as event.routeKey; the table below maps each key to the code that answers it.

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Answer 201 Created instead of 200: `return created(order)` */
class Created {
  constructor(readonly data: unknown) {}
}
const created = (data: unknown) => new Created(data);

const ORDER_STATUSES = ['reserved', 'paid', 'shipped', 'delivered', 'cancelled'];
const PO_STATUSES = ['requested', 'ordered', 'received', 'cancelled'];

const now = () => new Date().toISOString();

function findOrder(id: string): Order {
  const order = db.orders.find((o) => o.id === id || o.externalId === id);
  if (!order) throw new HttpError(404, `Order "${id}" not found`);
  return order;
}

function findPurchaseOrder(id: string): PurchaseOrder {
  const po = db.purchaseOrders.find((p) => p.id === id);
  if (!po) throw new HttpError(404, `Purchase order "${id}" not found`);
  return po;
}

function findProduct(sku: string) {
  const product = db.products.find((p) => p.sku === String(sku).toUpperCase());
  if (!product) throw new HttpError(404, `Product "${sku}" not found`);
  return product;
}

/** Sends an event to Make: WEBHOOK_URL (a Make custom webhook) and every hook the custom app registered for it. */
async function notify(type: string, data: unknown): Promise<void> {
  const urls = [
    process.env.WEBHOOK_URL,
    ...db.hooks.filter((h) => h.events.includes(type) || h.events.includes('*')).map((h) => h.targetUrl),
  ].filter((url): url is string => Boolean(url));
  const body = JSON.stringify({ id: nextId('evt'), type, createdAt: now(), data });
  await Promise.all(
    urls.map((url) =>
      fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(5000) }).catch((error) =>
        console.warn(`Webhook to ${url} failed: ${error.message}`),
      ),
    ),
  );
}

type Route = (req: { params: Record<string, string>; body: any }) => unknown;

const routes: Record<string, Route> = {
  'GET /health': () => ({ ok: true }),

  // The Make custom app's connection test
  'GET /api/me': () => ({ 
    ok: true, 
    storeName: db.storeName,
    approved: true,
    canSplitFullfill: true,
  }),

  'GET /api/products': () => db.products,
  'GET /api/products/{sku}': ({ params }) => findProduct(params.sku),

  'GET /api/orders': () => db.orders,
  'GET /api/orders/{id}': ({ params }) => findOrder(params.id),

  'POST /api/orders': async ({ body }) => {
    const { customer, items, externalId, note } = body;
    if (!customer?.name || !customer?.email) throw new HttpError(400, 'customer.name and customer.email are required');
    if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'items must be a non-empty array');
    // The same externalId twice returns the first order, so a retried Make scenario can't create a duplicate
    const existing = externalId && db.orders.find((o) => o.externalId === externalId);
    if (existing) return existing;

    const lines = items.map((item: { sku: string; qty: number | string }) => {
      const product = findProduct(item.sku);
      return { sku: product.sku, name: product.name, qty: Number(item.qty), unitPrice: product.price };
    });
    const order: Order = {
      id: nextId('ord'),
      externalId: externalId || null,
      status: 'reserved',
      customer: { name: customer.name, email: customer.email },
      items: lines,
      total: Math.round(lines.reduce((sum: number, l: { qty: number; unitPrice: number }) => sum + l.qty * l.unitPrice, 0) * 100) / 100,
      shipping: { carrier: null, trackingNumber: null },
      note: note || null,
      createdAt: now(),
      updatedAt: now(),
    };
    db.orders.push(order);
    await notify('order.created', order);
    return created(order);
  },

  'POST /api/orders/{id}/status': async ({ params, body }) => {
    const order = findOrder(params.id);
    if (!ORDER_STATUSES.includes(body.status)) throw new HttpError(400, `status must be one of: ${ORDER_STATUSES.join(', ')}`);
    const from = order.status;
    order.status = body.status;
    if (body.carrier) order.shipping.carrier = body.carrier;
    if (body.trackingNumber) order.shipping.trackingNumber = body.trackingNumber;
    order.updatedAt = now();
    await notify('order.status_changed', { from, to: order.status, order });
    return order;
  },

  'GET /api/purchase-orders': () => db.purchaseOrders,

  'POST /api/purchase-orders': async ({ body }) => {
    const product = findProduct(body.sku);
    const po: PurchaseOrder = {
      id: nextId('po'),
      sku: product.sku,
      productName: product.name,
      qty: Number(body.qty) || product.reorderQty,
      supplier: product.supplier,
      status: 'requested',
      createdAt: now(),
      updatedAt: now(),
    };
    db.purchaseOrders.push(po);
    await notify('purchase_order.created', po);
    return created(po);
  },

  'POST /api/purchase-orders/{id}/status': async ({ params, body }) => {
    const po = findPurchaseOrder(params.id);
    if (!PO_STATUSES.includes(body.status)) throw new HttpError(400, `status must be one of: ${PO_STATUSES.join(', ')}`);
    const from = po.status;
    if (body.status === 'received' && from !== 'received') findProduct(po.sku).onHand += po.qty;
    po.status = body.status;
    po.updatedAt = now();
    await notify('purchase_order.status_changed', { from, to: po.status, purchaseOrder: po });
    return po;
  },

  // What Make's daily digest scenario posts to Slack
  'GET /api/inventory/report': () => {
    const lowStock = db.products.filter((p) => p.onHand <= p.reorderPoint);
    const lowStockText = lowStock.length
      ? lowStock.map((p) => `• ${p.sku} ${p.name}: ${p.onHand} on hand (reorder at ${p.reorderPoint})`).join('\n')
      : 'All products are above their reorder points.';
    return {
      storeName: db.storeName,
      lowStockCount: lowStock.length,
      lowStock,
      lowStockText,
      // Already JSON-encoded, so Make can send it as a Slack webhook body as-is
      slackMessageJson: JSON.stringify({ text: `*${db.storeName}: daily inventory*\n${lowStockText}` }),
    };
  },

  // Make's custom app registers its "Watch events" webhook here when a scenario starts, and removes it when it stops
  'POST /api/hooks': ({ body }) => {
    if (!body.targetUrl) throw new HttpError(400, 'targetUrl is required');
    const events = Array.isArray(body.events) ? body.events : String(body.events ?? '*').split(',');
    const hook = { id: nextId('hk'), targetUrl: body.targetUrl, events };
    db.hooks.push(hook);
    return created(hook);
  },
  'DELETE /api/hooks/{id}': ({ params }) => {
    db.hooks = db.hooks.filter((h) => h.id !== params.id);
    return { id: params.id, deleted: true };
  },
};

const json = (statusCode: number, data: unknown): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
});

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    // Every route except /health needs the key, as an x-api-key header or "Authorization: Bearer <key>" (what Make's
    // HTTP module sends for token auth). API Gateway lowercases header names. A plain comparison is fine for mock data.
    // Spaces and quotes around a key pasted into Make are trimmed.
    const raw = event.headers?.['x-api-key'] || event.headers?.authorization?.replace(/^Bearer\s+/i, '') || '';
    const key = raw.trim().replace(/^["']|["']$/g, '');
    if (event.routeKey !== 'GET /health' && (!process.env.API_KEY || key !== process.env.API_KEY)) {
      // Which auth headers arrived, and how long the key was (never the key itself): enough to see what Make sent
      const authHeaders = Object.keys(event.headers ?? {}).filter((h) => /key|auth|token/i.test(h));
      console.warn(`401 on ${event.routeKey}: auth headers [${authHeaders.join(', ') || 'none'}], key length ${key.length} (expected ${process.env.API_KEY?.length ?? 0})`);
      throw new HttpError(401, 'Missing or invalid API key');
    }

    const route = routes[event.routeKey];
    if (!route) throw new HttpError(404, `Route ${event.requestContext?.http?.method} ${event.rawPath} not found`);

    let body: any = {};
    try {
      if (event.body) body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body);
    } catch {
      throw new HttpError(400, 'Request body is not valid JSON');
    }

    const result = await route({ params: (event.pathParameters ?? {}) as Record<string, string>, body });
    return result instanceof Created ? json(201, result.data) : json(200, result);
  } catch (error) {
    if (error instanceof HttpError) return json(error.status, { error: { message: error.message } });
    console.error(error);
    return json(500, { error: { message: 'Something went wrong' } });
  }
}
