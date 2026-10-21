'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const { Store } = require('./store');
const { EventBus, EVENT_TYPES } = require('./events');
const { InventoryService, ORDER_STATUSES, PO_STATUSES } = require('./inventory');
const { errorHandler, unauthorized, notFound, badRequest } = require('./errors');
const v = require('./validate');

function createLogger(level = 'info') {
  const order = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
  const min = order[level] ?? 20;
  const at = (lvl, fn) => (...args) => (order[lvl] >= min ? fn(`[${lvl}]`, ...args) : undefined);
  return { debug: at('debug', console.log), info: at('info', console.log), warn: at('warn', console.warn), error: at('error', console.error) };
}

function requireApiKey(apiKey) {
  const expected = Buffer.from(apiKey);
  return (req, res, next) => {
    const header = req.get('x-api-key') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const given = Buffer.from(header || '');
    if (!apiKey || given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      return next(unauthorized());
    }
    return next();
  };
}

const maskSecret = ({ secret, ...hook }) => ({ ...hook, secret: secret ? `${secret.slice(0, 6)}…` : null });

function buildServer(config, { fetchImpl, logger = createLogger(config.logLevel) } = {}) {
  const store = new Store({ file: config.dataFile });
  const bus = new EventBus({ store, config, logger, fetchImpl });
  const service = new InventoryService({ store, bus, config });

  if (store.isEmpty && config.seedFile && fs.existsSync(config.seedFile)) {
    service.seed(JSON.parse(fs.readFileSync(config.seedFile, 'utf8')));
    logger.info(`Seeded ${store.data.products.length} products from ${config.seedFile}`);
  }

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));
  app.get('/', (req, res) =>
    res.json({
      name: 'inventory-order-api',
      storeName: config.storeName,
      docs: 'See docs/API.md in the boilerplate',
      endpoints: ['/health', '/api/me', '/api/products', '/api/orders', '/api/purchase-orders', '/api/inventory/report', '/api/hooks', '/api/events'],
    }),
  );

  const api = express.Router();
  api.use(requireApiKey(config.apiKey));

  // Connection test used by Zapier auth, the n8n credential test and Make connections.
  api.get('/me', (req, res) => res.json({ ok: true, storeName: config.storeName, currency: config.currency, apiVersion: 1 }));

  // ----- products & stock -----
  api.get('/products', (req, res) => res.json(service.listProducts(req.query)));
  api.post('/products', (req, res) => res.status(201).json(service.createProduct(req.body)));
  api.get('/products/:ref', (req, res) => res.json(service.getProduct(req.params.ref)));
  api.patch('/products/:ref', (req, res) => res.json(service.updateProduct(req.params.ref, req.body)));
  api.post('/products/:ref/adjust', (req, res) => res.json(service.adjustStock(req.params.ref, req.body)));
  api.get('/inventory/low-stock', (req, res) => res.json(service.lowStockProducts()));
  api.get('/inventory/report', (req, res) => res.json(service.report()));
  api.get('/inventory/movements', (req, res) => {
    const { sku } = req.query;
    const list = store.data.movements.filter((m) => !sku || m.sku.toLowerCase() === String(sku).toLowerCase());
    res.json(list.slice(-Math.min(Number(req.query.limit) || 100, 500)).reverse());
  });

  // ----- orders -----
  api.get('/orders', (req, res) => {
    if (req.query.status && !ORDER_STATUSES.includes(req.query.status)) throw badRequest(`status must be one of: ${ORDER_STATUSES.join(', ')}`);
    res.json(service.listOrders(req.query));
  });
  api.post('/orders', (req, res) => {
    const { order, duplicate } = service.createOrder(req.body);
    res.status(duplicate ? 200 : 201).json({ ...order, duplicate });
  });
  api.get('/orders/:id', (req, res) => res.json(service.requireOrder(req.params.id)));
  api.post('/orders/:id/status', (req, res) => res.json(service.setOrderStatus(req.params.id, req.body)));

  // ----- purchase orders -----
  api.get('/purchase-orders', (req, res) => res.json(service.listPurchaseOrders(req.query)));
  api.post('/purchase-orders', (req, res) => {
    const { purchaseOrder, duplicate } = service.createPurchaseOrder(req.body);
    res.status(duplicate ? 200 : 201).json({ ...purchaseOrder, duplicate });
  });
  api.get('/purchase-orders/:id', (req, res) => res.json(service.requirePurchaseOrder(req.params.id)));
  api.post('/purchase-orders/:id/status', (req, res) => res.json(service.setPurchaseOrderStatus(req.params.id, req.body)));

  // ----- webhook subscriptions (REST hooks: Zapier, the n8n Inventory Trigger node, Make custom apps) -----
  api.get('/hooks', (req, res) => res.json([...config.subscriptions.map(maskSecret), ...store.data.hooks.map(maskSecret)]));
  api.post('/hooks', (req, res) => {
    const targetUrl = v.httpUrl({ targetUrl: req.body?.targetUrl ?? req.body?.url ?? req.body?.target_url }, 'targetUrl');
    let events = req.body?.events ?? req.body?.event ?? '*';
    if (typeof events === 'string') events = events.split(',').map((e) => e.trim()).filter(Boolean);
    if (!Array.isArray(events) || events.length === 0) throw badRequest('"events" must list at least one event');
    const unknown = events.filter((e) => e !== '*' && !EVENT_TYPES.includes(e));
    if (unknown.length) throw badRequest(`Unknown events: ${unknown.join(', ')}`, { allowed: ['*', ...EVENT_TYPES] });
    const hook = {
      id: store.nextId('hk'),
      targetUrl,
      events,
      secret: crypto.randomBytes(24).toString('hex'),
      createdAt: new Date().toISOString(),
      lastDeliveryAt: null,
      lastStatus: null,
    };
    store.data.hooks.push(hook);
    store.save();
    // The secret is only shown once, here. Receivers use it to verify x-inventory-signature.
    res.status(201).json(hook);
  });
  api.get('/hooks/:id', (req, res) => {
    const hook = store.data.hooks.find((h) => h.id === req.params.id);
    if (!hook) throw notFound(`Hook "${req.params.id}"`);
    res.json(maskSecret(hook));
  });
  api.delete('/hooks/:id', (req, res) => {
    const before = store.data.hooks.length;
    store.data.hooks = store.data.hooks.filter((h) => h.id !== req.params.id);
    if (store.data.hooks.length === before) throw notFound(`Hook "${req.params.id}"`);
    store.save();
    res.json({ id: req.params.id, deleted: true });
  });

  // ----- event log (polling fallback for tools that can't receive webhooks) -----
  api.get('/events', (req, res) => {
    const { type, after } = req.query;
    let list = store.data.events;
    if (type) {
      const types = String(type).split(',');
      list = list.filter((e) => types.includes(e.type));
    }
    if (after) list = list.filter((e) => e.createdAt > after);
    res.json(list.slice(-Math.min(Number(req.query.limit) || 50, 500)).reverse());
  });
  api.get('/meta', (req, res) => res.json({ events: EVENT_TYPES, orderStatuses: ORDER_STATUSES, purchaseOrderStatuses: PO_STATUSES }));

  app.use('/api', api);
  app.use((req, res, next) => next(notFound(`Route ${req.method} ${req.path}`)));
  app.use(errorHandler(logger));

  return { app, store, bus, service, logger };
}

module.exports = { buildServer, createLogger };
