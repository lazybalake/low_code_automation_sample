import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { handler } from '../src/handler';
import { resetMockData } from '../src/mockData';

/** Calls the Lambda the way API Gateway does: the matched route key, path parameters and raw body. */
async function call(
  routeKey: string,
  { params = {}, body, key = 'test-key', headers }: { params?: Record<string, string>; body?: unknown; key?: string; headers?: Record<string, string> } = {},
) {
  const event = {
    routeKey,
    rawPath: routeKey.split(' ')[1],
    headers: headers ?? { 'x-api-key': key },
    pathParameters: params,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    requestContext: { http: { method: routeKey.split(' ')[0] } },
  } as unknown as APIGatewayProxyEventV2;
  const res = await handler(event);
  return { status: res.statusCode, body: JSON.parse(res.body as string) };
}

// A local server standing in for Make's webhook URL
const received: { type: string; data: any }[] = [];
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c)).on('end', () => {
    received.push(JSON.parse(raw));
    res.end();
  });
});
let makeUrl = '';

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  makeUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/make`;
});
afterAll(() => new Promise((r) => server.close(r)));

beforeEach(() => {
  resetMockData();
  received.length = 0;
});

test('health is public, everything else needs the API key', async () => {
  expect((await call('GET /health', { key: '' })).status).toBe(200);
  expect((await call('GET /api/products', { key: 'wrong' })).status).toBe(401);
  expect((await call('GET /api/me')).body).toEqual({ ok: true, storeName: 'Trailhead Supply Co.' });
  expect((await call('GET /api/me', { headers: { authorization: 'Bearer test-key' } })).status, 'Bearer works too').toBe(200);
  expect((await call('GET /api/me', { headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
  expect((await call('GET /api/me', { key: ' "test-key" ' })).status, 'spaces and quotes from a paste are trimmed').toBe(200);
  expect((await call('$default')).status).toBe(404);
});

test('mock data comes back from the list and lookup routes', async () => {
  expect((await call('GET /api/products')).body).toHaveLength(6);
  expect((await call('GET /api/products/{sku}', { params: { sku: 'wb-750' } })).body.name).toBe('Insulated Water Bottle 750 ml');
  expect((await call('GET /api/orders/{id}', { params: { id: 'shop-1001' } })).body.id).toBe('ord_1001');
  expect((await call('GET /api/orders/{id}', { params: { id: 'nope' } })).status).toBe(404);
});

test('create an order, then the same externalId again returns it instead of a duplicate', async () => {
  const order = { customer: { name: 'Ada', email: 'ada@example.com' }, items: [{ sku: 'WB-750', qty: '2' }, { sku: 'HL-300', qty: 1 }], externalId: 'shop-9' };
  const first = await call('POST /api/orders', { body: order });
  expect(first.status).toBe(201);
  expect(first.body).toMatchObject({ id: 'ord_1003', status: 'reserved', total: 88.98 });

  const again = await call('POST /api/orders', { body: order });
  expect(again.status).toBe(200);
  expect(again.body.id).toBe('ord_1003');
  expect((await call('GET /api/orders')).body).toHaveLength(3);
});

test('bad input is a 400 with a message', async () => {
  expect((await call('POST /api/orders', { body: { items: [] } })).body.error.message).toMatch(/customer/);
  expect((await call('POST /api/orders', { body: '{' })).status).toBe(400);
  expect((await call('POST /api/orders/{id}/status', { params: { id: 'ord_1001' }, body: { status: 'lost' } })).status).toBe(400);
});

test('Make custom app: register a hook, receive events, remove it', async () => {
  const hook = await call('POST /api/hooks', { body: { targetUrl: makeUrl, events: ['order.status_changed'] } });
  expect(hook.status).toBe(201);

  const shipped = await call('POST /api/orders/{id}/status', { params: { id: 'ord_1001' }, body: { status: 'shipped', carrier: 'UPS', trackingNumber: '1Z1' } });
  expect(shipped.body.shipping).toEqual({ carrier: 'UPS', trackingNumber: '1Z1' });
  expect(received).toHaveLength(1);
  expect(received[0]).toMatchObject({ type: 'order.status_changed', data: { from: 'paid', to: 'shipped' } });

  await call('DELETE /api/hooks/{id}', { params: { id: hook.body.id } });
  await call('POST /api/orders/{id}/status', { params: { id: 'ord_1001' }, body: { status: 'delivered' } });
  expect(received).toHaveLength(1);
});

test('WEBHOOK_URL gets new purchase orders; receiving one adds stock; the report shows low stock', async () => {
  process.env.WEBHOOK_URL = makeUrl;
  try {
    const po = await call('POST /api/purchase-orders', { body: { sku: 'TM-12' } });
    expect(po.body).toMatchObject({ id: 'po_1002', qty: 40, status: 'requested' });
    expect(received.map((e) => e.type)).toEqual(['purchase_order.created']);
  } finally {
    delete process.env.WEBHOOK_URL;
  }

  const before = (await call('GET /api/inventory/report')).body;
  expect(before.lowStock.map((p: { sku: string }) => p.sku)).toEqual(['TM-12', 'MUG-ENM']);
  expect(JSON.parse(before.slackMessageJson).text).toMatch(/TM-12/);

  await call('POST /api/purchase-orders/{id}/status', { params: { id: 'po_1001' }, body: { status: 'received' } });
  expect((await call('GET /api/products/{sku}', { params: { sku: 'MUG-ENM' } })).body.onHand).toBe(30);
  expect((await call('GET /api/inventory/report')).body.lowStockCount).toBe(1);
});
