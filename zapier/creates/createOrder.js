'use strict';

const { api, withSummary, ORDER_SAMPLE, orderOutputFields } = require('../lib/api');

module.exports = {
  key: 'create_order',
  noun: 'Order',
  display: {
    label: 'Create Order',
    description: 'Creates an order. Stock is reserved if available; otherwise the order is backordered.',
  },
  operation: {
    inputFields: [
      { key: 'customerName', label: 'Customer Name', required: true },
      { key: 'customerEmail', label: 'Customer Email', required: true },
      {
        key: 'items',
        label: 'Line Items',
        required: true,
        children: [
          { key: 'sku', label: 'SKU', required: true, dynamic: 'product_list.sku.label' },
          { key: 'qty', label: 'Quantity', required: true, type: 'integer', default: '1' },
        ],
      },
      {
        key: 'externalId',
        label: 'External ID',
        required: false,
        helpText: 'An ID from your form or shop. If the Zap retries, the same External ID returns the existing order instead of creating a duplicate.',
      },
      { key: 'note', label: 'Note', required: false, type: 'text' },
    ],
    perform: async (z, bundle) => {
      const { customerName, customerEmail, items, externalId, note } = bundle.inputData;
      const response = await z.request({
        url: api(bundle, '/orders'),
        method: 'POST',
        body: {
          customer: { name: customerName, email: customerEmail },
          items: (items || []).map((i) => ({ sku: i.sku, qty: Number(i.qty) })),
          externalId: externalId || undefined,
          note: note || undefined,
        },
      });
      return withSummary(response.data);
    },
    sample: withSummary(ORDER_SAMPLE),
    outputFields: orderOutputFields,
  },
};
