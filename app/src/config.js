'use strict';

const path = require('node:path');

/**
 * WEBHOOK_SUBSCRIPTIONS lets you point events at fixed URLs without calling the API.
 * Format: comma-separated `event=url` pairs. Use `|` for several events, `*` for all.
 *   order.created=http://n8n:5678/webhook/inv-order-created,
 *   inventory.low_stock|purchase_order.created=https://hook.us1.make.com/abc123
 */
function parseSubscriptions(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry, i) => {
      const eq = entry.indexOf('=');
      const events = eq === -1 ? ['*'] : entry.slice(0, eq).split('|').map((e) => e.trim()).filter(Boolean);
      const targetUrl = (eq === -1 ? entry : entry.slice(eq + 1)).trim();
      return { id: `static_${i + 1}`, events, targetUrl, static: true };
    });
}

function loadConfig(env = process.env) {
  const dataFile = env.DATA_FILE === ':memory:'
    ? null
    : path.resolve(env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json'));

  return {
    port: Number(env.PORT || 3000),
    host: env.HOST || '0.0.0.0',
    storeName: env.STORE_NAME || 'Trailhead Supply Co.',
    currency: env.CURRENCY || 'USD',
    apiKey: env.API_KEY || '',
    publicBaseUrl: env.PUBLIC_BASE_URL || '',
    dataFile,
    seedFile: path.resolve(env.SEED_FILE || path.join(__dirname, '..', 'data', 'seed.json')),
    webhookSecret: env.WEBHOOK_SECRET || '',
    subscriptions: parseSubscriptions(env.WEBHOOK_SUBSCRIPTIONS),
    deliveryRetries: Number(env.WEBHOOK_RETRIES ?? 3),
    deliveryBackoffMs: Number(env.WEBHOOK_BACKOFF_MS ?? 500),
    deliveryTimeoutMs: Number(env.WEBHOOK_TIMEOUT_MS ?? 5000),
    eventLogLimit: Number(env.EVENT_LOG_LIMIT ?? 500),
    logLevel: env.LOG_LEVEL || 'info',
  };
}

module.exports = { loadConfig, parseSubscriptions };
