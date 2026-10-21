'use strict';

const ORDER_STATUSES = ['backordered', 'reserved', 'paid', 'shipped', 'delivered', 'cancelled'];
const PO_STATUSES = ['requested', 'ordered', 'received', 'cancelled'];

/** Full URL for an API path, tolerating a trailing slash on the Base URL field. */
const api = (bundle, path) => `${String(bundle.authData.baseUrl).trim().replace(/\/+$/, '')}/api${path}`;

const label = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const choices = (values) => values.map((value) => ({ value, sample: value, label: label(value) }));

/**
 * Adds flat fields to an order so two-step Zaps (free plan) can drop them
 * straight into an email without a Formatter step.
 */
const withSummary = (order) => ({
  ...order,
  customerName: order.customer?.name,
  customerEmail: order.customer?.email,
  itemsSummary: (order.items || []).map((i) => `${i.qty} x ${i.name} (${i.sku})`).join(', '),
  trackingNumber: order.shipping?.trackingNumber ?? null,
  carrier: order.shipping?.carrier ?? null,
});

/** REST hook subscribe helper shared by every instant trigger. */
const subscribe = (events) => async (z, bundle) => {
  const response = await z.request({
    url: api(bundle, '/hooks'),
    method: 'POST',
    body: { targetUrl: bundle.targetUrl, events },
  });
  return response.data; // stored by Zapier as bundle.subscribeData
};

const unsubscribe = async (z, bundle) => {
  const response = await z.request({
    url: api(bundle, `/hooks/${bundle.subscribeData.id}`),
    method: 'DELETE',
    skipThrowForStatus: true,
  });
  // A 404 means the API already forgot the hook (for example after a data reset); that's fine.
  if (response.status >= 400 && response.status !== 404) response.throwForStatus();
  return { id: bundle.subscribeData.id, deleted: true };
};

const ORDER_SAMPLE = {
  id: 'ord_1001',
  externalId: null,
  status: 'reserved',
  customer: { name: 'Jordan Rivers', email: 'jordan@example.com' },
  items: [{ productId: 'prd_1001', sku: 'WB-750', name: 'Insulated Water Bottle 750 ml', qty: 2, unitPrice: 24.99, lineTotal: 49.98 }],
  total: 49.98,
  currency: 'USD',
  shortages: [],
  shipping: { carrier: null, trackingNumber: null },
  note: null,
  createdAt: '2026-10-21T12:00:00.000Z',
  updatedAt: '2026-10-21T12:00:00.000Z',
};

const PRODUCT_SAMPLE = {
  id: 'prd_1005',
  sku: 'TM-12',
  name: 'Trail Mix 12-Pack',
  price: 21,
  onHand: 8,
  reserved: 1,
  available: 7,
  reorderPoint: 10,
  reorderQty: 40,
  supplier: 'Basecamp Foods',
  lowStock: true,
};

const PO_SAMPLE = {
  id: 'po_1001',
  productId: 'prd_1006',
  sku: 'MUG-ENM',
  productName: 'Enamel Camp Mug',
  qty: 30,
  supplier: 'Summit Drinkware',
  reason: 'backorder',
  status: 'requested',
  createdAt: '2026-10-21T12:00:00.000Z',
  updatedAt: '2026-10-21T12:00:00.000Z',
};

const orderOutputFields = [
  { key: 'id', label: 'Order ID' },
  { key: 'status', label: 'Status' },
  { key: 'customerName', label: 'Customer Name' },
  { key: 'customerEmail', label: 'Customer Email' },
  { key: 'itemsSummary', label: 'Items Summary' },
  { key: 'total', label: 'Total', type: 'number' },
  { key: 'currency', label: 'Currency' },
  { key: 'carrier', label: 'Carrier' },
  { key: 'trackingNumber', label: 'Tracking Number' },
  { key: 'createdAt', label: 'Created At', type: 'datetime' },
];

module.exports = {
  api,
  choices,
  withSummary,
  subscribe,
  unsubscribe,
  ORDER_STATUSES,
  PO_STATUSES,
  ORDER_SAMPLE,
  PRODUCT_SAMPLE,
  PO_SAMPLE,
  orderOutputFields,
};
