'use strict';

const { api, PRODUCT_SAMPLE } = require('../lib/api');

module.exports = {
  key: 'adjust_stock',
  noun: 'Stock',
  display: {
    label: 'Adjust Stock',
    description: 'Adds or removes on-hand units for a product, for example after a stock count.',
  },
  operation: {
    inputFields: [
      { key: 'sku', label: 'SKU', required: true, dynamic: 'product_list.sku.label' },
      { key: 'delta', label: 'Change', required: true, type: 'integer', helpText: 'Positive to add stock, negative to remove it.' },
      { key: 'reason', label: 'Reason', required: false, default: 'zapier' },
    ],
    perform: async (z, bundle) => {
      const { sku, delta, reason } = bundle.inputData;
      const response = await z.request({
        url: api(bundle, `/products/${encodeURIComponent(sku)}/adjust`),
        method: 'POST',
        body: { delta: Number(delta), reason: reason || 'zapier' },
      });
      return response.data;
    },
    sample: PRODUCT_SAMPLE,
  },
};
