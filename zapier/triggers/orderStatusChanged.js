'use strict';

const { api, choices, withSummary, subscribe, unsubscribe, ORDER_STATUSES, ORDER_SAMPLE, orderOutputFields } = require('../lib/api');

// The same order changes status many times, so the output id is the *event* id, not the order id.
const shape = (event) => ({
  ...withSummary(event.data.order),
  id: event.id,
  orderId: event.data.order.id,
  fromStatus: event.data.from,
  toStatus: event.data.to,
  changedAt: event.createdAt,
});

const matches = (bundle) => (event) => !bundle.inputData.status || event.data.to === bundle.inputData.status;

module.exports = {
  key: 'order_status_changed',
  noun: 'Order',
  display: {
    label: 'Order Status Changed',
    description: 'Triggers instantly when an order moves to a new status, such as shipped.',
  },
  operation: {
    type: 'hook',
    inputFields: [
      {
        key: 'status',
        label: 'New Status',
        required: false,
        choices: choices(ORDER_STATUSES),
        helpText: 'Only trigger for this status. Leave empty to trigger on every change.',
      },
    ],
    performSubscribe: subscribe(['order.status_changed']),
    performUnsubscribe: unsubscribe,
    perform: (z, bundle) => [bundle.cleanedRequest].filter(matches(bundle)).map(shape),
    performList: async (z, bundle) => {
      const response = await z.request({ url: api(bundle, '/events'), params: { type: 'order.status_changed', limit: 50 } });
      return response.data.filter(matches(bundle)).map(shape);
    },
    sample: shape({
      id: 'evt_1042',
      type: 'order.status_changed',
      createdAt: '2026-10-21T15:30:00.000Z',
      data: {
        from: 'paid',
        to: 'shipped',
        order: { ...ORDER_SAMPLE, status: 'shipped', shipping: { carrier: 'UPS', trackingNumber: '1Z999AA10123456784' } },
      },
    }),
    outputFields: [
      { key: 'id', label: 'Event ID' },
      { key: 'orderId', label: 'Order ID' },
      { key: 'fromStatus', label: 'From Status' },
      { key: 'toStatus', label: 'To Status' },
      { key: 'changedAt', label: 'Changed At', type: 'datetime' },
      ...orderOutputFields.filter((f) => f.key !== 'id'),
    ],
  },
};
