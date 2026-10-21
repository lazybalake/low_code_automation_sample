'use strict';

const { api, PRODUCT_SAMPLE } = require('../lib/api');

// Hidden polling trigger that powers the SKU dropdowns in the actions.
module.exports = {
  key: 'product_list',
  noun: 'Product',
  display: {
    label: 'List Products',
    description: 'Lists products for dropdowns.',
    hidden: true,
  },
  operation: {
    perform: async (z, bundle) => {
      const response = await z.request({ url: api(bundle, '/products') });
      return response.data.map((p) => ({ ...p, label: `${p.sku} · ${p.name} (${p.available} available)` }));
    },
    sample: { ...PRODUCT_SAMPLE, label: 'TM-12 · Trail Mix 12-Pack (7 available)' },
  },
};
