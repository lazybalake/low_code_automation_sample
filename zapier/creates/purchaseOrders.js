'use strict';

const { api, choices, PO_STATUSES, PO_SAMPLE } = require('../lib/api');

const createPurchaseOrder = {
  key: 'create_purchase_order',
  noun: 'Purchase Order',
  display: {
    label: 'Create Purchase Order',
    description: 'Requests a restock. Returns the open purchase order instead if one already exists for the product.',
  },
  operation: {
    inputFields: [
      { key: 'sku', label: 'SKU', required: true, dynamic: 'product_list.sku.label' },
      { key: 'qty', label: 'Quantity', required: false, type: 'integer', helpText: "Leave empty to use the product's reorder quantity." },
      { key: 'reason', label: 'Reason', required: false, default: 'zapier' },
    ],
    perform: async (z, bundle) => {
      const { sku, qty, reason } = bundle.inputData;
      const response = await z.request({
        url: api(bundle, '/purchase-orders'),
        method: 'POST',
        body: { sku, qty: qty ? Number(qty) : undefined, reason: reason || 'zapier' },
      });
      return response.data;
    },
    sample: { ...PO_SAMPLE, duplicate: false },
  },
};

const updatePurchaseOrder = {
  key: 'update_purchase_order',
  noun: 'Purchase Order',
  display: {
    label: 'Update Purchase Order Status',
    description: 'Marks a purchase order ordered, received or cancelled. Received adds the stock and fills waiting backorders.',
  },
  operation: {
    inputFields: [
      { key: 'purchaseOrderId', label: 'Purchase Order ID', required: true, helpText: 'For example `po_1001`.' },
      { key: 'status', label: 'New Status', required: true, choices: choices(PO_STATUSES.filter((s) => s !== 'requested')) },
      { key: 'note', label: 'Note', required: false },
    ],
    perform: async (z, bundle) => {
      const { purchaseOrderId, status, note } = bundle.inputData;
      const response = await z.request({
        url: api(bundle, `/purchase-orders/${encodeURIComponent(purchaseOrderId)}/status`),
        method: 'POST',
        body: { status, note: note || undefined },
      });
      return response.data;
    },
    sample: { ...PO_SAMPLE, status: 'received' },
  },
};

module.exports = { createPurchaseOrder, updatePurchaseOrder };
