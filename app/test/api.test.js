'use strict';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { buildServer, createLogger } = require('../src/app');
const { loadConfig } = require('../src/config');
const { verifySignature } = require('../src/events');

const API_KEY = 'test-key';
const SECRET = 'test-secret';

/** A local server that records webhook deliveries. */
function startReceiver() {
  const received = [];
  let respondWith = 200;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ path: req.url, headers: req.headers, body, json: JSON.parse(body) });
      res.writeHead(respondWith).end();
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        server,
        received,
        url: (p) => `http://127.0.0.1:${server.address().port}${p}`,
        setStatus: (s) => (respondWith = s),
      }),
    ),
  );
}

async function startApp(receiver, extraEnv = {}) {
  const config = loadConfig({
    API_KEY,
    WEBHOOK_SECRET: SECRET,
    DATA_FILE: ':memory:',
    WEBHOOK_RETRIES: '1',
    WEBHOOK_BACKOFF_MS: '10',
    WEBHOOK_SUBSCRIPTIONS: `*=${receiver.url('/all')}`,
    ...extraEnv,
  });
  const ctx = buildServer(config, { logger: createLogger('silent') });
  const server = await new Promise((resolve) => {
    const s = ctx.app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body, headers = {}) => {
    const res = await fetch(base + p, {
      method,
      headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { ...ctx, server, base, call };
}

const order = (items, extra = {}) => ({ customer: { name: 'Ada Lovelace', email: 'ada@example.com' }, items, ...extra });

describe('inventory order API', () => {
  let receiver;
  let app;

  before(async () => {
    receiver = await startReceiver();
  });
  after(() => receiver.server.close());

  beforeEach(async () => {
    if (app) app.server.close();
    receiver.received.length = 0;
    receiver.setStatus(200);
    app = await startApp(receiver);
  });
  after(() => app?.server.close());

  const eventsOf = (type) => receiver.received.filter((r) => r.json.type === type);

  test('health is public, /api needs the key', async () => {
    assert.equal((await fetch(`${app.base}/health`)).status, 200);
    const res = await app.call('GET', '/api/products', undefined, { 'x-api-key': 'wrong' });
    assert.equal(res.status, 401);
    const ok = await app.call('GET', '/api/me');
    assert.equal(ok.status, 200);
    assert.equal(ok.body.storeName, 'Trailhead Supply Co.');
  });

  test('seed products load with derived stock fields', async () => {
    const { body } = await app.call('GET', '/api/products');
    assert.equal(body.length, 6);
    const tm = body.find((p) => p.sku === 'TM-12');
    assert.equal(tm.available, 8);
    assert.equal(tm.lowStock, true);
    const bySku = await app.call('GET', '/api/products/wb-750');
    assert.equal(bySku.body.name, 'Insulated Water Bottle 750 ml');
  });

  test('an order with stock reserves it and sends a signed order.created', async () => {
    const res = await app.call('POST', '/api/orders', order([{ sku: 'WB-750', qty: 2 }, { sku: 'hl-300', qty: '1' }]));
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'reserved');
    assert.equal(res.body.total, 88.98);

    const wb = (await app.call('GET', '/api/products/WB-750')).body;
    assert.equal(wb.reserved, 2);
    assert.equal(wb.available, 38);

    await app.bus.flush();
    const [delivery] = eventsOf('order.created');
    assert.ok(delivery, 'order.created was delivered');
    assert.equal(delivery.json.data.id, res.body.id);
    assert.ok(
      verifySignature({
        secret: SECRET,
        timestamp: delivery.headers['x-inventory-timestamp'],
        body: delivery.body,
        signature: delivery.headers['x-inventory-signature'],
      }),
      'signature verifies',
    );
  });

  test('same externalId is idempotent', async () => {
    const first = await app.call('POST', '/api/orders', order([{ sku: 'SK-MER-M', qty: 1 }], { externalId: 'shop-123' }));
    const again = await app.call('POST', '/api/orders', order([{ sku: 'SK-MER-M', qty: 1 }], { externalId: 'shop-123' }));
    assert.equal(first.status, 201);
    assert.equal(again.status, 200);
    assert.equal(again.body.id, first.body.id);
    assert.equal(again.body.duplicate, true);
  });

  test('short stock backorders, and receiving a PO auto-allocates it', async () => {
    const res = await app.call('POST', '/api/orders', order([{ sku: 'MUG-ENM', qty: 3 }]));
    assert.equal(res.body.status, 'backordered');
    assert.deepEqual(res.body.shortages, [{ sku: 'MUG-ENM', requested: 3, available: 0, short: 3 }]);

    const po = await app.call('POST', '/api/purchase-orders', { sku: 'MUG-ENM', reason: 'backorder' });
    assert.equal(po.status, 201);
    assert.equal(po.body.qty, 30, 'defaults to reorderQty');

    const big = await app.call('POST', '/api/purchase-orders', { sku: 'HL-300', atLeast: 45 });
    assert.equal(big.body.qty, 45, 'atLeast wins when larger than reorderQty');
    const small = await app.call('POST', '/api/purchase-orders', { sku: 'WB-750', atLeast: 2 });
    assert.equal(small.body.qty, 50, 'reorderQty wins when larger');

    const dup = await app.call('POST', '/api/purchase-orders', { sku: 'MUG-ENM', qty: 5 });
    assert.equal(dup.status, 200);
    assert.equal(dup.body.id, po.body.id, 'one open PO per product');

    await app.call('POST', `/api/purchase-orders/${po.body.id}/status`, { status: 'ordered' });
    await app.call('POST', `/api/purchase-orders/${po.body.id}/status`, { status: 'received' });

    const after = (await app.call('GET', `/api/orders/${res.body.id}`)).body;
    assert.equal(after.status, 'reserved');
    const mug = (await app.call('GET', '/api/products/MUG-ENM')).body;
    assert.equal(mug.onHand, 30);
    assert.equal(mug.reserved, 3);

    await app.bus.flush();
    const allocated = eventsOf('order.status_changed').find((e) => e.json.data.order.id === res.body.id);
    assert.equal(allocated.json.data.from, 'backordered');
    assert.equal(allocated.json.data.to, 'reserved');
  });

  test('ship takes stock out, cancel releases it, bad transitions are 409', async () => {
    const a = (await app.call('POST', '/api/orders', order([{ sku: 'HL-300', qty: 2 }]))).body;
    const b = (await app.call('POST', '/api/orders', order([{ sku: 'HL-300', qty: 3 }]))).body;

    assert.equal((await app.call('POST', `/api/orders/${a.id}/status`, { status: 'shipped' })).status, 409);
    await app.call('POST', `/api/orders/${a.id}/status`, { status: 'paid' });
    const shipped = await app.call('POST', `/api/orders/${a.id}/status`, { status: 'shipped', carrier: 'UPS', trackingNumber: '1Z999' });
    assert.equal(shipped.body.shipping.trackingNumber, '1Z999');

    await app.call('POST', `/api/orders/${b.id}/status`, { status: 'cancelled' });
    const hl = (await app.call('GET', '/api/products/HL-300')).body;
    assert.equal(hl.onHand, 13);
    assert.equal(hl.reserved, 0);

    const again = await app.call('POST', `/api/orders/${a.id}/status`, { status: 'shipped' });
    assert.equal(again.status, 200, 'repeating the current status is a no-op');
  });

  test('low stock fires once when crossing the reorder point', async () => {
    // RJ-M: 4 on hand, reorder point 3.
    await app.call('POST', '/api/orders', order([{ sku: 'RJ-M', qty: 1 }]));
    await app.call('POST', '/api/orders', order([{ sku: 'RJ-M', qty: 1 }]));
    await app.bus.flush();
    const low = eventsOf('inventory.low_stock').filter((e) => e.json.data.product.sku === 'RJ-M');
    assert.equal(low.length, 1);
    assert.equal(low[0].json.data.suggestedReorderQty, 10);

    const adj = await app.call('POST', '/api/products/RJ-M/adjust', { delta: -5 });
    assert.equal(adj.status, 409, 'cannot remove reserved stock');
  });

  test('REST hooks: subscribe, receive with own secret, unsubscribe; 410 removes', async () => {
    const sub = await app.call('POST', '/api/hooks', { targetUrl: receiver.url('/zap'), event: 'order.created' });
    assert.equal(sub.status, 201);
    assert.ok(sub.body.secret.length > 20);

    await app.call('POST', '/api/orders', order([{ sku: 'SK-MER-M', qty: 1 }]));
    await app.bus.flush();
    const hit = receiver.received.find((r) => r.path === '/zap');
    assert.ok(hit);
    assert.ok(verifySignature({ secret: sub.body.secret, timestamp: hit.headers['x-inventory-timestamp'], body: hit.body, signature: hit.headers['x-inventory-signature'] }));

    const del = await app.call('DELETE', `/api/hooks/${sub.body.id}`);
    assert.equal(del.body.deleted, true);

    const gone = await app.call('POST', '/api/hooks', { targetUrl: receiver.url('/gone'), events: ['*'] });
    receiver.setStatus(410);
    await app.call('POST', '/api/orders', order([{ sku: 'SK-MER-M', qty: 1 }]));
    await app.bus.flush();
    const hooks = (await app.call('GET', '/api/hooks')).body;
    assert.ok(!hooks.some((h) => h.id === gone.body.id), 'hook removed after 410');

    const bad = await app.call('POST', '/api/hooks', { targetUrl: receiver.url('/x'), event: 'nope' });
    assert.equal(bad.status, 400);
  });

  test('events log and report support polling clients', async () => {
    await app.call('POST', '/api/orders', order([{ sku: 'TM-12', qty: 1 }]));
    const events = (await app.call('GET', '/api/events?type=order.created,inventory.low_stock')).body;
    assert.deepEqual(events.map((e) => e.type).sort(), ['inventory.low_stock', 'order.created']);
    const report = (await app.call('GET', '/api/inventory/report')).body;
    assert.ok(report.lowStockCount >= 2);
    assert.match(report.lowStockText, /TM-12/);
    assert.match(JSON.parse(report.slackMessageJson).text, /TM-12/);
    assert.equal(report.orders.byStatus.reserved, 1);
  });

  test('validation errors are 400 with a clear message', async () => {
    const res = await app.call('POST', '/api/orders', order([{ sku: 'NOPE', qty: 1 }]));
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /unknown SKU NOPE/);
    const badJson = await fetch(`${app.base}/api/orders`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': API_KEY }, body: '{' });
    assert.equal(badJson.status, 400);
  });
});

test('file store persists across restarts', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-'));
  const file = path.join(dir, 'db.json');
  const config = loadConfig({ API_KEY, DATA_FILE: file });
  const first = buildServer(config, { logger: createLogger('silent') });
  first.service.createOrder(order([{ sku: 'WB-750', qty: 1 }]));
  const second = buildServer(config, { logger: createLogger('silent') });
  assert.equal(second.store.data.orders.length, 1);
  assert.equal(second.service.getProduct('WB-750').reserved, 1);
  assert.equal(second.store.data.products.length, 6, 'seed did not run twice');
  fs.rmSync(dir, { recursive: true, force: true });
});
