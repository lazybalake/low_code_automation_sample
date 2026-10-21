/**
 * Calls each route of the running mock API and prints what comes back.
 *   npm run demo                                    (the local API from npm run dev, API_KEY from .env)
 *   BASE_URL=https://<api-id>.execute-api.us-east-1.amazonaws.com API_KEY=... node scripts/demo.mjs
 */

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const KEY = process.env.API_KEY;
if (!KEY) {
  console.error('Set API_KEY (or run from the backend folder with a .env file).');
  process.exit(1);
}

const step = (n, text) => console.log(`\n\x1b[1m${n}. ${text}\x1b[0m`);

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-api-key': KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data.error?.message}`);
  return data;
}

try {
  const me = await api('GET', '/api/me');
  console.log(`Connected to ${me.storeName} at ${BASE}`);
  
  step(1, 'Products (mock data)');
  for (const p of await api('GET', '/api/products')) console.log(`   ${p.sku.padEnd(9)} ${String(p.onHand).padStart(3)} on hand  ${p.name}`);

  step(2, 'A customer orders 2 water bottles');
  const order = await api('POST', '/api/orders', { customer: { name: 'Sam Okafor', email: 'sam@example.com' }, items: [{ sku: 'WB-750', qty: 2 }] });
  console.log(`   ${order.id} is ${order.status}, total $${order.total}  -> order.created goes to Make`);

  step(3, 'It is paid and shipped');
  await api('POST', `/api/orders/${order.id}/status`, { status: 'paid' });
  const shipped = await api('POST', `/api/orders/${order.id}/status`, { status: 'shipped', carrier: 'UPS', trackingNumber: '1Z999AA10123456784' });
  console.log(`   ${shipped.id} is ${shipped.status} via ${shipped.shipping.carrier}  -> order.status_changed goes to Make`);

  step(4, 'Trail mix is low, so a purchase order is raised');
  const po = await api('POST', '/api/purchase-orders', { sku: 'TM-12' });
  console.log(`   ${po.id}: ${po.qty} x ${po.sku} from ${po.supplier}  -> purchase_order.created goes to Make, which sends it to the supplier`);

  step(5, 'The mugs on order (po_1001) arrive');
  await api('POST', '/api/purchase-orders/po_1001/status', { status: 'received' });
  const mug = await api('GET', '/api/products/MUG-ENM');
  console.log(`   MUG-ENM now has ${mug.onHand} on hand`);

  step(6, 'Inventory report (what the Make daily digest posts)');
  const report = await api('GET', '/api/inventory/report');
  console.log(report.lowStockText.split('\n').map((l) => `   ${l}`).join('\n'));

  console.log('\nDone. Restart npm run dev to get the original mock data back.');
} catch (err) {
  console.error(`\nDemo stopped: ${err.message}`);
  process.exit(1);
}
