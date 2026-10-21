import { nowIso } from './ids';
import { countOrdersByStatus, OPEN_ORDER_STATUSES } from './orders';
import { listProducts } from './products';
import { listPurchaseOrders } from './purchaseOrders';

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function inventoryReport() {
  const storeName = process.env.STORE_NAME || 'Trailhead Supply Co.';
  const [products, byStatus, openPOs] = await Promise.all([listProducts(), countOrdersByStatus(), listPurchaseOrders({ status: 'open' })]);
  const lowStock = products.filter((p) => p.lowStock);
  const lowStockText = lowStock.length
    ? lowStock.map((p) => `• ${p.sku} ${p.name}: ${p.available} available (reorder at ${p.reorderPoint})`).join('\n')
    : 'All products are above their reorder points.';
  return {
    generatedAt: nowIso(),
    storeName,
    totals: {
      products: products.length,
      unitsOnHand: products.reduce((s, p) => s + p.onHand, 0),
      unitsReserved: products.reduce((s, p) => s + p.reserved, 0),
      inventoryValue: round2(products.reduce((s, p) => s + p.onHand * p.price, 0)),
    },
    lowStockCount: lowStock.length,
    lowStock,
    // Pre-formatted so a two-module Make scenario can post it to Slack or email without iterators
    lowStockText,
    // Already JSON-encoded: drop it straight into an HTTP body for a Slack incoming webhook
    // (pasting lowStockText into a JSON body by hand breaks on its line breaks)
    slackMessageJson: JSON.stringify({
      text: `*${storeName}: daily inventory*\n${lowStock.length} product(s) at or below reorder point\n${lowStockText}\nOpen purchase orders: ${openPOs.length}`,
    }),
    orders: { byStatus, open: OPEN_ORDER_STATUSES.reduce((s, status) => s + byStatus[status], 0) },
    purchaseOrders: { open: openPOs.length, openIds: openPOs.map((po) => po.id) },
  };
}
