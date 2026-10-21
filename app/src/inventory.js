'use strict';

const v = require('./validate');
const { badRequest, notFound, conflict } = require('./errors');

/**
 * Order lifecycle. Stock rules:
 *   create      -> reserves stock if every line is available, else "backordered" (nothing reserved)
 *   backordered -> reserved happens automatically when stock arrives (adjust or PO received)
 *   shipped     -> reserved units leave on-hand stock
 *   cancelled   -> any reservation is released
 */
const ORDER_TRANSITIONS = {
  backordered: ['reserved', 'cancelled'],
  reserved: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};
const ORDER_STATUSES = Object.keys(ORDER_TRANSITIONS);
const OPEN_ORDER_STATUSES = ['backordered', 'reserved', 'paid'];

const PO_TRANSITIONS = {
  requested: ['ordered', 'received', 'cancelled'],
  ordered: ['received', 'cancelled'],
  received: [],
  cancelled: [],
};
const PO_STATUSES = Object.keys(PO_TRANSITIONS);
const OPEN_PO_STATUSES = ['requested', 'ordered'];

const round2 = (n) => Math.round(n * 100) / 100;
const nowIso = () => new Date().toISOString();

class InventoryService {
  constructor({ store, bus, config }) {
    this.store = store;
    this.bus = bus;
    this.config = config;
  }

  get db() {
    return this.store.data;
  }

  // ---------- presentation ----------

  presentProduct(p) {
    const { lowStockAlerted, ...rest } = p;
    const available = p.onHand - p.reserved;
    return { ...rest, available, lowStock: available <= p.reorderPoint };
  }

  // ---------- products ----------

  findProduct(ref) {
    const key = String(ref).trim();
    return this.db.products.find((p) => p.id === key || p.sku.toLowerCase() === key.toLowerCase());
  }

  requireProduct(ref) {
    const p = this.findProduct(ref);
    if (!p) throw notFound(`Product "${ref}"`);
    return p;
  }

  listProducts({ sku, lowStock } = {}) {
    let list = this.db.products;
    if (sku) list = list.filter((p) => p.sku.toLowerCase() === String(sku).toLowerCase());
    let out = list.map((p) => this.presentProduct(p));
    if (lowStock === 'true' || lowStock === true) out = out.filter((p) => p.lowStock);
    return out;
  }

  getProduct(ref) {
    return this.presentProduct(this.requireProduct(ref));
  }

  createProduct(input, { silent = false } = {}) {
    const sku = v.str(input, 'sku', { max: 64 }).toUpperCase();
    if (this.findProduct(sku)) throw conflict(`SKU ${sku} already exists`);
    const p = {
      id: this.store.nextId('prd'),
      sku,
      name: v.str(input, 'name'),
      price: v.money(input, 'price'),
      onHand: v.int(input, 'onHand', { optional: true, min: 0 }) ?? 0,
      reserved: 0,
      reorderPoint: v.int(input, 'reorderPoint', { optional: true, min: 0 }) ?? 0,
      reorderQty: v.int(input, 'reorderQty', { optional: true, min: 1 }) ?? 1,
      supplier: v.str(input, 'supplier', { optional: true }) ?? null,
      lowStockAlerted: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.db.products.push(p);
    this.store.save();
    if (!silent) this.checkLowStock(p);
    return this.presentProduct(p);
  }

  updateProduct(ref, input) {
    const p = this.requireProduct(ref);
    const name = v.str(input, 'name', { optional: true });
    const price = v.money(input, 'price', { optional: true });
    const reorderPoint = v.int(input, 'reorderPoint', { optional: true, min: 0 });
    const reorderQty = v.int(input, 'reorderQty', { optional: true, min: 1 });
    const supplier = v.str(input, 'supplier', { optional: true });
    if (input?.onHand !== undefined) throw badRequest('Change stock with POST /api/products/:ref/adjust');
    Object.assign(p, Object.fromEntries(
      Object.entries({ name, price, reorderPoint, reorderQty, supplier }).filter(([, val]) => val !== undefined),
    ));
    p.updatedAt = nowIso();
    this.store.save();
    this.checkLowStock(p);
    return this.presentProduct(p);
  }

  adjustStock(ref, input) {
    const p = this.requireProduct(ref);
    const delta = v.int(input, 'delta', { min: -1e6, max: 1e6 });
    if (delta === 0) throw badRequest('"delta" cannot be 0');
    const reason = v.str(input, 'reason', { optional: true }) ?? 'manual';
    if (p.onHand + delta < p.reserved) {
      throw conflict(`Cannot remove ${-delta} units of ${p.sku}: ${p.reserved} are reserved for orders`, {
        onHand: p.onHand,
        reserved: p.reserved,
      });
    }
    p.onHand += delta;
    p.updatedAt = nowIso();
    this.recordMovement(p, delta, reason);
    this.store.save();
    this.bus.emit('inventory.adjusted', { product: this.presentProduct(p), delta, reason });
    this.checkLowStock(p);
    if (delta > 0) this.allocateBackorders();
    return this.presentProduct(p);
  }

  recordMovement(p, delta, reason, ref = null) {
    this.db.movements.push({ id: this.store.nextId('mov'), productId: p.id, sku: p.sku, delta, reason, ref, at: nowIso() });
    if (this.db.movements.length > 2000) this.db.movements.splice(0, this.db.movements.length - 2000);
  }

  lowStockProducts() {
    return this.listProducts({ lowStock: true });
  }

  /** Edge-triggered: fires once when available stock drops to the reorder point, re-arms when it recovers. */
  checkLowStock(p) {
    const available = p.onHand - p.reserved;
    const isLow = available <= p.reorderPoint;
    if (isLow && !p.lowStockAlerted) {
      p.lowStockAlerted = true;
      this.store.save();
      const openPo = this.db.purchaseOrders.find((po) => po.productId === p.id && OPEN_PO_STATUSES.includes(po.status));
      this.bus.emit('inventory.low_stock', {
        product: this.presentProduct(p),
        suggestedReorderQty: Math.max(p.reorderQty, p.reorderPoint - available + 1),
        openPurchaseOrderId: openPo?.id ?? null,
      });
    } else if (!isLow && p.lowStockAlerted) {
      p.lowStockAlerted = false;
      this.store.save();
    }
  }

  // ---------- orders ----------

  listOrders({ status, limit, since } = {}) {
    let list = [...this.db.orders];
    if (status) list = list.filter((o) => o.status === status);
    if (since) list = list.filter((o) => o.createdAt > since);
    list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const n = Math.min(Number(limit) || 50, 200);
    return list.slice(0, n);
  }

  requireOrder(id) {
    const o = this.db.orders.find((x) => x.id === id || (x.externalId && x.externalId === id));
    if (!o) throw notFound(`Order "${id}"`);
    return o;
  }

  createOrder(input) {
    const customer = input?.customer ?? {};
    const name = v.str(customer, 'name');
    const mail = v.email(customer, 'email');
    const externalId = v.str(input, 'externalId', { optional: true, max: 100 }) ?? null;
    const note = v.str(input, 'note', { optional: true, max: 1000 }) ?? null;
    if (externalId) {
      const existing = this.db.orders.find((o) => o.externalId === externalId);
      // Idempotency: automations retry. Same externalId returns the same order.
      if (existing) return { order: existing, duplicate: true };
    }
    if (!Array.isArray(input?.items) || input.items.length === 0) throw badRequest('"items" must be a non-empty array');

    const merged = new Map();
    input.items.forEach((item, i) => {
      const sku = v.str(item, 'sku', { max: 64 }).toUpperCase();
      const qty = v.int(item, 'qty', { min: 1, max: 10000 });
      const p = this.findProduct(sku);
      if (!p) throw badRequest(`items[${i}]: unknown SKU ${sku}`);
      merged.set(p.id, { product: p, qty: (merged.get(p.id)?.qty ?? 0) + qty });
    });

    const items = [...merged.values()].map(({ product, qty }) => ({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      qty,
      unitPrice: product.price,
      lineTotal: round2(product.price * qty),
    }));

    const order = {
      id: this.store.nextId('ord'),
      externalId,
      status: 'backordered',
      customer: { name, email: mail },
      items,
      total: round2(items.reduce((s, it) => s + it.lineTotal, 0)),
      currency: this.config.currency,
      shortages: [],
      shipping: { carrier: null, trackingNumber: null },
      note,
      history: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    const shortages = this.shortagesFor(order);
    if (shortages.length === 0) {
      this.reserve(order);
      order.status = 'reserved';
    } else {
      order.shortages = shortages;
    }
    order.history.push({ status: order.status, at: order.createdAt, note: 'Order created' });
    this.db.orders.push(order);
    this.store.save();
    this.bus.emit('order.created', order);
    for (const it of order.items) this.checkLowStock(this.requireProduct(it.productId));
    return { order, duplicate: false };
  }

  shortagesFor(order) {
    return order.items
      .map((it) => {
        const p = this.requireProduct(it.productId);
        const available = p.onHand - p.reserved;
        return { sku: it.sku, requested: it.qty, available: Math.max(available, 0), short: it.qty - Math.max(available, 0) };
      })
      .filter((s) => s.short > 0);
  }

  reserve(order) {
    for (const it of order.items) this.requireProduct(it.productId).reserved += it.qty;
  }

  release(order) {
    for (const it of order.items) {
      const p = this.requireProduct(it.productId);
      p.reserved = Math.max(0, p.reserved - it.qty);
    }
  }

  setOrderStatus(id, input) {
    const order = this.requireOrder(id);
    const to = v.oneOf(input, 'status', ORDER_STATUSES);
    const note = v.str(input, 'note', { optional: true, max: 1000 }) ?? null;
    const from = order.status;
    if (from === to) return order; // idempotent for retrying automations
    if (!ORDER_TRANSITIONS[from].includes(to)) {
      throw conflict(`Order ${order.id} cannot go from "${from}" to "${to}"`, { allowed: ORDER_TRANSITIONS[from] });
    }

    if (to === 'reserved') {
      const shortages = this.shortagesFor(order);
      if (shortages.length) {
        order.shortages = shortages;
        this.store.save();
        throw conflict(`Not enough stock to reserve order ${order.id}`, { shortages });
      }
      this.reserve(order);
      order.shortages = [];
    }
    if (to === 'shipped') {
      order.shipping = {
        carrier: v.str(input, 'carrier', { optional: true }) ?? order.shipping.carrier,
        trackingNumber: v.str(input, 'trackingNumber', { optional: true }) ?? order.shipping.trackingNumber,
      };
      for (const it of order.items) {
        const p = this.requireProduct(it.productId);
        p.reserved -= it.qty;
        p.onHand -= it.qty;
        this.recordMovement(p, -it.qty, 'shipped', order.id);
      }
    }
    if (to === 'cancelled' && ['reserved', 'paid'].includes(from)) this.release(order);

    this.applyOrderStatus(order, from, to, note);
    if (to === 'cancelled') this.allocateBackorders(); // freed stock may cover a waiting order
    for (const it of order.items) this.checkLowStock(this.requireProduct(it.productId));
    return order;
  }

  applyOrderStatus(order, from, to, note) {
    order.status = to;
    order.updatedAt = nowIso();
    order.history.push({ status: to, at: order.updatedAt, note });
    this.store.save();
    this.bus.emit('order.status_changed', { from, to, order });
  }

  /** First-come, first-served: reserve backordered orders that stock now covers. */
  allocateBackorders() {
    const waiting = this.db.orders
      .filter((o) => o.status === 'backordered')
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    for (const order of waiting) {
      const shortages = this.shortagesFor(order);
      if (shortages.length === 0) {
        this.reserve(order);
        order.shortages = [];
        this.applyOrderStatus(order, 'backordered', 'reserved', 'Stock arrived, auto-allocated');
      } else {
        order.shortages = shortages;
      }
    }
    this.store.save();
  }

  // ---------- purchase orders ----------

  listPurchaseOrders({ status, sku } = {}) {
    let list = [...this.db.purchaseOrders];
    if (status === 'open') list = list.filter((po) => OPEN_PO_STATUSES.includes(po.status));
    else if (status) list = list.filter((po) => po.status === status);
    if (sku) list = list.filter((po) => po.sku.toLowerCase() === String(sku).toLowerCase());
    return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  requirePurchaseOrder(id) {
    const po = this.db.purchaseOrders.find((x) => x.id === id);
    if (!po) throw notFound(`Purchase order "${id}"`);
    return po;
  }

  createPurchaseOrder(input) {
    const p = this.requireProduct(v.str(input, 'sku', { max: 64 }));
    // qty = exact amount. atLeast = "the shortfall, or the usual reorder size if that's bigger".
    const atLeast = v.int(input, 'atLeast', { optional: true, min: 1, max: 1e6 });
    const qty = v.int(input, 'qty', { optional: true, min: 1, max: 1e6 }) ?? Math.max(atLeast ?? 0, p.reorderQty);
    const reason = v.str(input, 'reason', { optional: true }) ?? 'manual';
    const dedupe = input?.dedupe !== false && input?.dedupe !== 'false';
    if (dedupe) {
      // Low-stock alerts and backorders can both ask for the same restock; keep one open PO per product.
      const open = this.db.purchaseOrders.find((po) => po.productId === p.id && OPEN_PO_STATUSES.includes(po.status));
      if (open) return { purchaseOrder: open, duplicate: true };
    }
    const po = {
      id: this.store.nextId('po'),
      productId: p.id,
      sku: p.sku,
      productName: p.name,
      qty,
      supplier: v.str(input, 'supplier', { optional: true }) ?? p.supplier,
      reason,
      status: 'requested',
      history: [{ status: 'requested', at: nowIso(), note: reason }],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.db.purchaseOrders.push(po);
    this.store.save();
    this.bus.emit('purchase_order.created', po);
    return { purchaseOrder: po, duplicate: false };
  }

  setPurchaseOrderStatus(id, input) {
    const po = this.requirePurchaseOrder(id);
    const to = v.oneOf(input, 'status', PO_STATUSES);
    const note = v.str(input, 'note', { optional: true, max: 1000 }) ?? null;
    const from = po.status;
    if (from === to) return po;
    if (!PO_TRANSITIONS[from].includes(to)) {
      throw conflict(`Purchase order ${po.id} cannot go from "${from}" to "${to}"`, { allowed: PO_TRANSITIONS[from] });
    }
    po.status = to;
    po.updatedAt = nowIso();
    po.history.push({ status: to, at: po.updatedAt, note });
    let product = null;
    if (to === 'received') {
      const p = this.requireProduct(po.productId);
      p.onHand += po.qty;
      p.updatedAt = nowIso();
      this.recordMovement(p, po.qty, 'purchase_order_received', po.id);
      product = p;
    }
    this.store.save();
    this.bus.emit('purchase_order.status_changed', { from, to, purchaseOrder: po });
    if (product) {
      this.checkLowStock(product);
      this.allocateBackorders();
    }
    return po;
  }

  // ---------- reporting ----------

  report() {
    const products = this.listProducts();
    const lowStock = products.filter((p) => p.lowStock);
    const byStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
    for (const o of this.db.orders) byStatus[o.status] += 1;
    const openPOs = this.db.purchaseOrders.filter((po) => OPEN_PO_STATUSES.includes(po.status));
    const lowStockText = lowStock.length
      ? lowStock.map((p) => `• ${p.sku} ${p.name}: ${p.available} available (reorder at ${p.reorderPoint})`).join('\n')
      : 'All products are above their reorder points.';
    return {
      generatedAt: nowIso(),
      storeName: this.config.storeName,
      totals: {
        products: products.length,
        unitsOnHand: products.reduce((s, p) => s + p.onHand, 0),
        unitsReserved: products.reduce((s, p) => s + p.reserved, 0),
        inventoryValue: round2(products.reduce((s, p) => s + p.onHand * p.price, 0)),
      },
      lowStockCount: lowStock.length,
      lowStock,
      // Pre-formatted so a two-module Make or Zapier flow can post it to Slack/email without iterators.
      lowStockText,
      // Already JSON-encoded: drop it straight into an HTTP body for a Slack incoming webhook.
      // (Pasting lowStockText into a JSON body by hand breaks on its line breaks.)
      slackMessageJson: JSON.stringify({
        text: `*${this.config.storeName}: daily inventory*\n${lowStock.length} product(s) at or below reorder point\n${lowStockText}\nOpen purchase orders: ${openPOs.length}`,
      }),
      orders: { byStatus, open: this.db.orders.filter((o) => OPEN_ORDER_STATUSES.includes(o.status)).length },
      purchaseOrders: { open: openPOs.length, openIds: openPOs.map((po) => po.id) },
    };
  }

  /**
   * Load seed products the first time the app starts with an empty store.
   * Silent on purpose: products that start below their reorder point raise
   * their low-stock alert on the first real stock change, once your tools are connected.
   */
  seed({ products = [] } = {}) {
    for (const p of products) this.createProduct(p, { silent: true });
  }
}

module.exports = {
  InventoryService,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  PO_STATUSES,
  PO_TRANSITIONS,
};
