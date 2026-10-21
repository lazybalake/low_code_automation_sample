'use strict';

const { api, subscribe, unsubscribe, PRODUCT_SAMPLE } = require('../lib/api');

const shape = (event) => ({
  ...event.data.product,
  id: event.id,
  productId: event.data.product.id,
  suggestedReorderQty: event.data.suggestedReorderQty,
  openPurchaseOrderId: event.data.openPurchaseOrderId,
  alertedAt: event.createdAt,
});

module.exports = {
  key: 'low_stock',
  noun: 'Product',
  display: {
    label: 'Low Stock',
    description: "Triggers instantly when a product's available stock drops to its reorder point.",
  },
  operation: {
    type: 'hook',
    performSubscribe: subscribe(['inventory.low_stock']),
    performUnsubscribe: unsubscribe,
    perform: (z, bundle) => [shape(bundle.cleanedRequest)],
    performList: async (z, bundle) => {
      const events = (await z.request({ url: api(bundle, '/events'), params: { type: 'inventory.low_stock', limit: 10 } })).data;
      if (events.length) return events.map(shape);
      // No alerts yet: show what is currently low so the Zap editor has real fields to map.
      const low = (await z.request({ url: api(bundle, '/inventory/low-stock') })).data;
      return low.map((p) => ({ ...p, id: `low_${p.id}`, productId: p.id, suggestedReorderQty: p.reorderQty, openPurchaseOrderId: null, alertedAt: null }));
    },
    sample: { ...PRODUCT_SAMPLE, id: 'evt_1007', productId: PRODUCT_SAMPLE.id, suggestedReorderQty: 40, openPurchaseOrderId: null, alertedAt: '2026-10-21T12:05:00.000Z' },
    outputFields: [
      { key: 'sku', label: 'SKU' },
      { key: 'name', label: 'Product Name' },
      { key: 'available', label: 'Available', type: 'integer' },
      { key: 'reorderPoint', label: 'Reorder Point', type: 'integer' },
      { key: 'suggestedReorderQty', label: 'Suggested Reorder Qty', type: 'integer' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'openPurchaseOrderId', label: 'Open Purchase Order ID' },
    ],
  },
};
