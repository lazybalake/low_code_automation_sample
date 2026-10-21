'use strict';

const { api, choices, withSummary, ORDER_STATUSES, ORDER_SAMPLE, orderOutputFields } = require('../lib/api');

module.exports = {
  key: 'update_order_status',
  noun: 'Order',
  display: {
    label: 'Update Order Status',
    description: 'Moves an order to paid, shipped, delivered or cancelled. Shipping takes the stock out of inventory.',
  },
  operation: {
    inputFields: [
      { key: 'orderId', label: 'Order ID', required: true, helpText: 'For example `ord_1001`, or the External ID you created it with.' },
      { key: 'status', label: 'New Status', required: true, choices: choices(ORDER_STATUSES.filter((s) => s !== 'backordered')) },
      { key: 'carrier', label: 'Carrier', required: false, helpText: 'Used when the status is shipped.' },
      { key: 'trackingNumber', label: 'Tracking Number', required: false, helpText: 'Used when the status is shipped.' },
      { key: 'note', label: 'Note', required: false },
    ],
    perform: async (z, bundle) => {
      const { orderId, status, carrier, trackingNumber, note } = bundle.inputData;
      const response = await z.request({
        url: api(bundle, `/orders/${encodeURIComponent(orderId)}/status`),
        method: 'POST',
        body: { status, carrier: carrier || undefined, trackingNumber: trackingNumber || undefined, note: note || undefined },
      });
      return withSummary(response.data);
    },
    sample: withSummary({ ...ORDER_SAMPLE, status: 'paid' }),
    outputFields: orderOutputFields,
  },
};
