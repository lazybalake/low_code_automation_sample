'use strict';

/**
 * Walks the whole order flow against a running API so you can watch n8n, Zapier and Make react.
 *   npm run demo                 (uses PORT/API_KEY from .env)
 *   BASE_URL=https://your-tunnel API_KEY=... node scripts/demo.js
 */

const BASE = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
const KEY = process.env.API_KEY;
const PAUSE = Number(process.env.DEMO_PAUSE_MS ?? 2500);

if (!KEY) {
  console.error('Set API_KEY (or run from the app folder with a .env file).');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (n, text) => console.log(`\n\x1b[1m${n}. ${text}\x1b[0m`);

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-api-key': KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data.error)}`);
  return data;
}

(async () => {
  const me = await api('GET', '/api/me');
  console.log(`Connected to ${me.storeName} at ${BASE}`);

  step(1, 'Customer orders 2 water bottles (in stock)');
  const o1 = await api('POST', '/api/orders', {
    customer: { name: 'Jordan Rivers', email: 'jordan@example.com' },
    items: [{ sku: 'WB-750', qty: 2 }],
  });
  console.log(`   ${o1.id} is ${o1.status}, total $${o1.total}  -> Zapier "New Order" sends the confirmation email`);

  step(2, 'Customer orders 3 camp mugs (0 in stock)');
  const o2 = await api('POST', '/api/orders', {
    customer: { name: 'Sam Okafor', email: 'sam@example.com' },
    items: [{ sku: 'MUG-ENM', qty: 3 }],
  });
  console.log(`   ${o2.id} is ${o2.status}, short ${o2.shortages.map((s) => `${s.short} x ${s.sku}`).join(', ')}`);
  console.log('   -> n8n "Order intake" raises a purchase order for the shortage');

  step(3, 'A trail mix order pushes TM-12 below its reorder point');
  await api('POST', '/api/orders', { customer: { name: 'Lee Park', email: 'lee@example.com' }, items: [{ sku: 'TM-12', qty: 1 }] });
  console.log('   -> inventory.low_stock fires; n8n "Low stock reorder" creates a PO; Make sends it to the supplier');

  console.log(`\n   Waiting ${PAUSE / 1000}s for automations...`);
  await sleep(PAUSE);

  step(4, 'Purchase orders now open');
  let pos = await api('GET', '/api/purchase-orders?status=open');
  if (!pos.some((po) => po.sku === 'MUG-ENM')) {
    console.log('   (No automation created the mug PO, so the demo creates it, as n8n would.)');
    await api('POST', '/api/purchase-orders', { sku: 'MUG-ENM', reason: 'backorder' });
    pos = await api('GET', '/api/purchase-orders?status=open');
  }
  for (const po of pos) console.log(`   ${po.id}: ${po.qty} x ${po.sku} from ${po.supplier} [${po.status}]`);

  step(5, 'The mug shipment arrives');
  const mugPo = pos.find((po) => po.sku === 'MUG-ENM');
  await api('POST', `/api/purchase-orders/${mugPo.id}/status`, { status: 'received', note: 'Dock 2' });
  const o2After = await api('GET', `/api/orders/${o2.id}`);
  console.log(`   ${o2.id} went backordered -> ${o2After.status} automatically`);

  step(6, 'First order is paid and shipped');
  await api('POST', `/api/orders/${o1.id}/status`, { status: 'paid' });
  await api('POST', `/api/orders/${o1.id}/status`, { status: 'shipped', carrier: 'UPS', trackingNumber: '1Z999AA10123456784' });
  console.log('   -> Zapier "Order Status Changed (shipped)" emails tracking to the customer');

  step(7, 'Inventory report (what the Make daily digest posts)');
  const report = await api('GET', '/api/inventory/report');
  console.log(`   Units on hand: ${report.totals.unitsOnHand}, reserved: ${report.totals.unitsReserved}, value: $${report.totals.inventoryValue}`);
  console.log(report.lowStockText.split('\n').map((l) => `   ${l}`).join('\n'));
  console.log('\nDone. GET /api/events shows every event that was sent.');
})().catch((err) => {
  console.error(`\nDemo stopped: ${err.message}`);
  process.exit(1);
});
