'use strict';

/**
 * Runs every trigger, action and search against a running inventory API.
 *   1. Start the API:   cd ../app && npm start
 *   2. cp .env.example .env  (TEST_BASE_URL, TEST_API_KEY)
 *   3. npm test
 */
const zapier = require('zapier-platform-core');

zapier.tools.env.inject();
const App = require('../index');

const appTester = zapier.createAppTester(App);
const authData = { baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000', apiKey: process.env.TEST_API_KEY || '' };
const run = (fn, inputData = {}, extra = {}) => appTester(fn, { authData, inputData, ...extra });

const ready = Boolean(process.env.TEST_API_KEY);
const maybe = ready ? describe : describe.skip;

maybe('inventory Zapier integration', () => {
  let orderId;

  it('authenticates and labels the connection', async () => {
    const me = await run(App.authentication.test);
    expect(me.ok).toBe(true);
    expect(App.authentication.connectionLabel(null, { inputData: me })).toBe(me.storeName);
  });

  it('rejects a bad API key with a clear message', async () => {
    await expect(appTester(App.authentication.test, { authData: { ...authData, apiKey: 'nope' } })).rejects.toThrow(/API key was rejected/);
  });

  it('lists products for the SKU dropdown', async () => {
    const products = await run(App.triggers.product_list.operation.perform);
    expect(products.length).toBeGreaterThan(0);
    expect(products[0].label).toMatch(/available/);
  });

  it('creates an order with line items and finds it again', async () => {
    const order = await run(App.creates.create_order.operation.perform, {
      customerName: 'Zap Tester',
      customerEmail: 'zap@example.com',
      items: [{ sku: 'SK-MER-M', qty: '2' }],
      externalId: `zap-${Date.now()}`,
    });
    expect(order.status).toBe('reserved');
    expect(order.itemsSummary).toBe('2 x Merino Hiking Socks (M) (SK-MER-M)');
    orderId = order.id;

    const [found] = await run(App.searches.find_order.operation.perform, { orderId });
    expect(found.id).toBe(orderId);
    expect(await run(App.searches.find_order.operation.perform, { orderId: 'ord_missing' })).toEqual([]);
  });

  it('surfaces API validation errors', async () => {
    await expect(
      run(App.creates.create_order.operation.perform, { customerName: 'X', customerEmail: 'x@example.com', items: [{ sku: 'NOPE', qty: 1 }] }),
    ).rejects.toThrow(/unknown SKU NOPE/);
  });

  it('new_order: performList and the REST hook payload give the same shape', async () => {
    const list = await run(App.triggers.new_order.operation.performList);
    expect(list.find((o) => o.id === orderId)).toBeTruthy();
    const fromHook = await run(App.triggers.new_order.operation.perform, {}, {
      cleanedRequest: { id: 'evt_x', type: 'order.created', createdAt: new Date().toISOString(), data: list[0] },
    });
    expect(Object.keys(fromHook[0]).sort()).toEqual(Object.keys(list[0]).sort());
  });

  it('subscribes and unsubscribes REST hooks', async () => {
    const sub = await run(App.triggers.new_order.operation.performSubscribe, {}, { targetUrl: 'http://127.0.0.1:9/zapier-test-hook' });
    expect(sub.id).toMatch(/^hk_/);
    const res = await run(App.triggers.new_order.operation.performUnsubscribe, {}, { subscribeData: sub });
    expect(res.deleted).toBe(true);
    const again = await run(App.triggers.new_order.operation.performUnsubscribe, {}, { subscribeData: sub });
    expect(again.deleted).toBe(true); // 404 is treated as already gone
  });

  it('pays and ships the order, and the status trigger filters by status', async () => {
    await run(App.creates.update_order_status.operation.perform, { orderId, status: 'paid' });
    const shipped = await run(App.creates.update_order_status.operation.perform, {
      orderId,
      status: 'shipped',
      carrier: 'UPS',
      trackingNumber: '1ZTEST',
    });
    expect(shipped.trackingNumber).toBe('1ZTEST');

    const onlyShipped = await run(App.triggers.order_status_changed.operation.performList, { status: 'shipped' });
    expect(onlyShipped.every((e) => e.toStatus === 'shipped')).toBe(true);
    expect(onlyShipped.find((e) => e.orderId === orderId)).toBeTruthy();

    const hookPayload = { id: 'evt_1', type: 'order.status_changed', createdAt: new Date().toISOString(), data: { from: 'reserved', to: 'paid', order: shipped } };
    expect(await run(App.triggers.order_status_changed.operation.perform, { status: 'shipped' }, { cleanedRequest: hookPayload })).toEqual([]);
    expect(await run(App.triggers.order_status_changed.operation.perform, {}, { cleanedRequest: hookPayload })).toHaveLength(1);
  });

  it('adjusts stock and finds the product', async () => {
    const before = (await run(App.searches.find_product.operation.perform, { sku: 'HL-300' }))[0];
    const after = await run(App.creates.adjust_stock.operation.perform, { sku: 'HL-300', delta: '3', reason: 'cycle count' });
    expect(after.onHand).toBe(before.onHand + 3);
  });

  it('creates and receives a purchase order', async () => {
    const po = await run(App.creates.create_purchase_order.operation.perform, { sku: 'TM-12' });
    expect(po.sku).toBe('TM-12');
    const received = await run(App.creates.update_purchase_order.operation.perform, { purchaseOrderId: po.id, status: 'received' });
    expect(received.status).toBe('received');
  });

  it('low_stock performList always returns mappable rows', async () => {
    const rows = await run(App.triggers.low_stock.operation.performList);
    expect(Array.isArray(rows)).toBe(true);
    rows.forEach((r) => expect(r.id).toBeTruthy());
  });
});

if (!ready) {
  test('integration tests skipped', () => {
    console.warn('Set TEST_BASE_URL and TEST_API_KEY in zapier/.env to run the integration tests.');
  });
}
