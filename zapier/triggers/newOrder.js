'use strict';

const { api, withSummary, subscribe, unsubscribe, ORDER_SAMPLE, orderOutputFields } = require('../lib/api');

module.exports = {
  key: 'new_order',
  noun: 'Order',
  display: {
    label: 'New Order',
    description: 'Triggers instantly when an order is created (reserved or backordered).',
  },
  operation: {
    type: 'hook',
    performSubscribe: subscribe(['order.created']),
    performUnsubscribe: unsubscribe,
    // The API posts { id, type, createdAt, data }. Zapier dedupes on the returned `id`, so use the order id.
    perform: (z, bundle) => [withSummary(bundle.cleanedRequest.data)],
    performList: async (z, bundle) => {
      const response = await z.request({ url: api(bundle, '/orders'), params: { limit: 10 } });
      return response.data.map(withSummary);
    },
    sample: withSummary(ORDER_SAMPLE),
    outputFields: orderOutputFields,
  },
};
