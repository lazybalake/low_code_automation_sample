'use strict';

const authentication = require('./authentication');
const newOrder = require('./triggers/newOrder');
const orderStatusChanged = require('./triggers/orderStatusChanged');
const lowStock = require('./triggers/lowStock');
const productList = require('./triggers/productList');
const createOrder = require('./creates/createOrder');
const updateOrderStatus = require('./creates/updateOrderStatus');
const adjustStock = require('./creates/adjustStock');
const { createPurchaseOrder, updatePurchaseOrder } = require('./creates/purchaseOrders');
const { findProduct, findOrder } = require('./searches');

const addApiKey = (request, z, bundle) => {
  if (bundle.authData.apiKey) request.headers['x-api-key'] = bundle.authData.apiKey;
  request.headers.accept = 'application/json';
  return request;
};

// Turn the API's { error: { message } } into readable Zap errors.
const handleErrors = (response, z) => {
  if (response.status === 401) {
    throw new z.errors.Error('The API key was rejected. Reconnect the account with the API_KEY from your .env.', 'AuthenticationError', 401);
  }
  if (response.status >= 400 && !response.skipThrowForStatus) {
    const message = response.data?.error?.message || `Inventory API returned ${response.status}`;
    throw new z.errors.Error(message, response.data?.error?.code || 'ApiError', response.status);
  }
  return response;
};

module.exports = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,

  authentication,
  beforeRequest: [addApiKey],
  afterResponse: [handleErrors],

  triggers: {
    [newOrder.key]: newOrder,
    [orderStatusChanged.key]: orderStatusChanged,
    [lowStock.key]: lowStock,
    [productList.key]: productList,
  },
  creates: {
    [createOrder.key]: createOrder,
    [updateOrderStatus.key]: updateOrderStatus,
    [adjustStock.key]: adjustStock,
    [createPurchaseOrder.key]: createPurchaseOrder,
    [updatePurchaseOrder.key]: updatePurchaseOrder,
  },
  searches: {
    [findProduct.key]: findProduct,
    [findOrder.key]: findOrder,
  },
};
