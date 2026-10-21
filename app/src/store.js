'use strict';

const fs = require('node:fs');
const path = require('node:path');

const empty = () => ({
  counters: {},
  products: [],
  orders: [],
  purchaseOrders: [],
  movements: [],
  hooks: [],
  events: [],
});

/**
 * A tiny JSON-file store so the boilerplate runs with zero setup.
 * Every mutation calls save(). Swap this class for Postgres/SQLite when you outgrow it:
 * the service layer only uses `data`, `nextId()` and `save()`.
 */
class Store {
  constructor({ file = null } = {}) {
    this.file = file;
    this.data = empty();
    if (file && fs.existsSync(file)) {
      this.data = { ...empty(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    }
  }

  get isEmpty() {
    return this.data.products.length === 0 && this.data.orders.length === 0;
  }

  nextId(prefix) {
    const n = (this.data.counters[prefix] ?? 1000) + 1;
    this.data.counters[prefix] = n;
    return `${prefix}_${n}`;
  }

  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store };
