'use strict';

const crypto = require('node:crypto');

const EVENT_TYPES = [
  'order.created',
  'order.status_changed',
  'inventory.low_stock',
  'inventory.adjusted',
  'purchase_order.created',
  'purchase_order.status_changed',
];

function sign(secret, timestamp, body) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** Verify a delivery on the receiving side (see docs/ARCHITECTURE.md). */
function verifySignature({ secret, timestamp, body, signature, toleranceSec = 300 }) {
  if (!secret || !timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSec) return false;
  const expected = Buffer.from(sign(secret, timestamp, body));
  const given = Buffer.from(String(signature));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Records every event in the store (so polling clients can read /api/events)
 * and pushes it to matching webhook subscriptions with retries and HMAC signatures.
 */
class EventBus {
  constructor({ store, config, logger, fetchImpl = globalThis.fetch }) {
    this.store = store;
    this.config = config;
    this.logger = logger;
    this.fetch = fetchImpl;
    this.pending = new Set();
  }

  emit(type, data) {
    const event = { id: this.store.nextId('evt'), type, createdAt: new Date().toISOString(), data };
    const log = this.store.data.events;
    log.push(event);
    if (log.length > this.config.eventLogLimit) log.splice(0, log.length - this.config.eventLogLimit);
    this.store.save();

    for (const target of this.targetsFor(type)) {
      const p = this.deliver(target, event).finally(() => this.pending.delete(p));
      this.pending.add(p);
    }
    return event;
  }

  targetsFor(type) {
    return [...this.config.subscriptions, ...this.store.data.hooks].filter(
      (h) => h.events.includes('*') || h.events.includes(type),
    );
  }

  async deliver(target, event) {
    const body = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = target.secret || this.config.webhookSecret;
    const headers = {
      'content-type': 'application/json',
      'user-agent': 'inventory-order-api/1.0',
      'x-inventory-event': event.type,
      'x-inventory-delivery': event.id,
      'x-inventory-timestamp': timestamp,
    };
    if (secret) headers['x-inventory-signature'] = sign(secret, timestamp, body);

    const attempts = this.config.deliveryRetries + 1;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const res = await this.fetch(target.targetUrl, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(this.config.deliveryTimeoutMs),
        });
        this.record(target, res.status);
        if (res.ok) return;
        if (res.status === 410) {
          // REST hook convention (used by Zapier): 410 Gone means "unsubscribe me".
          this.removeHook(target);
          return;
        }
        if (res.status < 500 && res.status !== 408 && res.status !== 429) {
          this.logger.warn(`Webhook ${target.id} rejected ${event.type} with ${res.status}; not retrying`);
          return;
        }
      } catch (err) {
        this.record(target, 0);
        this.logger.warn(`Webhook ${target.id} attempt ${attempt} failed: ${err.message}`);
      }
      if (attempt < attempts) await sleep(this.config.deliveryBackoffMs * 2 ** (attempt - 1));
    }
    this.logger.error(`Webhook ${target.id} gave up on ${event.id} after ${attempts} attempts`);
  }

  record(target, status) {
    if (target.static) return;
    const hook = this.store.data.hooks.find((h) => h.id === target.id);
    if (!hook) return;
    hook.lastDeliveryAt = new Date().toISOString();
    hook.lastStatus = status;
    this.store.save();
  }

  removeHook(target) {
    if (target.static) return;
    this.store.data.hooks = this.store.data.hooks.filter((h) => h.id !== target.id);
    this.store.save();
    this.logger.info(`Webhook ${target.id} returned 410, removed subscription`);
  }

  /** Wait for in-flight deliveries (used by tests and graceful shutdown). */
  async flush() {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
}

module.exports = { EventBus, EVENT_TYPES, sign, verifySignature };
