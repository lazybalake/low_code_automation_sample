# Zapier integration

Private Zapier Platform CLI integration for the inventory API: 3 instant (REST hook) triggers, 5 actions, 2 searches.

```bash
npm install
cp .env.example .env     # point at a running API
npm test                 # 11 integration tests
npm run validate
zapier-platform login && zapier-platform register "Trailhead Inventory" && zapier-platform push
```

Full guide, including the Zaps to build on the free plan: [../docs/SETUP-ZAPIER.md](../docs/SETUP-ZAPIER.md)

| Folder | Contents |
|---|---|
| `authentication.js` | Custom auth: Base URL + API key, tested against `/api/me` |
| `triggers/` | `new_order`, `order_status_changed`, `low_stock` (hooks) and a hidden `product_list` for SKU dropdowns |
| `creates/` | Create order, update order status, adjust stock, create / update purchase order |
| `searches/` | Find product by SKU, find order by ID or External ID |
| `lib/api.js` | URL helper, REST hook subscribe/unsubscribe, sample data, flat summary fields |
| `index.js` | Wires it together; adds the API key header and turns API errors into readable Zap errors |
