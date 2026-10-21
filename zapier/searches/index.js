'use strict';

const { api, withSummary, ORDER_SAMPLE, PRODUCT_SAMPLE, orderOutputFields } = require('../lib/api');

const findProduct = {
  key: 'find_product',
  noun: 'Product',
  display: {
    label: 'Find Product',
    description: 'Finds a product by SKU, including its available stock.',
  },
  operation: {
    inputFields: [{ key: 'sku', label: 'SKU', required: true }],
    perform: async (z, bundle) => {
      const response = await z.request({ url: api(bundle, '/products'), params: { sku: bundle.inputData.sku } });
      return response.data; // searches return an array; empty means "not found"
    },
    sample: PRODUCT_SAMPLE,
  },
};

const findOrder = {
  key: 'find_order',
  noun: 'Order',
  display: {
    label: 'Find Order',
    description: 'Finds an order by its ID or External ID.',
  },
  operation: {
    inputFields: [{ key: 'orderId', label: 'Order ID or External ID', required: true }],
    perform: async (z, bundle) => {
      const response = await z.request({
        url: api(bundle, `/orders/${encodeURIComponent(bundle.inputData.orderId)}`),
        skipThrowForStatus: true,
      });
      if (response.status === 404) return [];
      response.throwForStatus();
      return [withSummary(response.data)];
    },
    sample: withSummary(ORDER_SAMPLE),
    outputFields: orderOutputFields,
  },
};

module.exports = { findProduct, findOrder };
