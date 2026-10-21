# API reference

Base URL: `http://localhost:3000` locally, `http://app:3000` from inside Docker Compose, or your tunnel URL for Zapier and Make.

## Authentication

Every `/api` route needs the API key in a header:

```
x-api-key: <API_KEY>
```

`Authorization: Bearer <API_KEY>` also works. `/health` and `/` are public.

## Errors

```json
{ "error": { "code": "conflict", "message": "Order ord_1001 cannot go from \"reserved\" to \"shipped\"", "details": { "allowed": ["paid", "cancelled"] } } }
```

| Status | Code | Meaning |
|---|---|---|
| 400 | `bad_request`, `invalid_json` | Missing or invalid field |
| 401 | `unauthorized` | Missing or wrong API key |
| 404 | `not_found` | Unknown product, order, PO, hook or route |
| 409 | `conflict` | Not allowed right now (bad transition, would remove reserved stock, duplicate SKU) |

Numbers may be sent as strings (`"qty": "2"`), since Zapier and Make often do that.

## Endpoints

### Connection and meta

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | `{ ok, uptime }` (no key needed) |
| GET | `/api/me` | `{ ok, storeName, currency, apiVersion }`, used as the connection test by all three tools |
| GET | `/api/meta` | Event names, order statuses, PO statuses |

### Products and stock

| Method | Path | Body / query | Notes |
|---|---|---|---|
| GET | `/api/products` | `?sku=` `?lowStock=true` | Array |
| POST | `/api/products` | `sku, name, price, onHand?, reorderPoint?, reorderQty?, supplier?` | 201 |
| GET | `/api/products/:ref` | | `:ref` is the product ID or SKU (case-insensitive) |
| PATCH | `/api/products/:ref` | `name?, price?, reorderPoint?, reorderQty?, supplier?` | Stock can't be set here |
| POST | `/api/products/:ref/adjust` | `delta, reason?` | 409 if it would drop below reserved |
| GET | `/api/inventory/low-stock` | | Products at or below their reorder point |
| GET | `/api/inventory/report` | | Totals, low-stock list, pre-formatted `lowStockText` and `slackMessageJson` |
| GET | `/api/inventory/movements` | `?sku=` `?limit=` | Stock movement history, newest first |

Product shape:

```json
{
  "id": "prd_1005", "sku": "TM-12", "name": "Trail Mix 12-Pack", "price": 21,
  "onHand": 8, "reserved": 1, "available": 7, "lowStock": true,
  "reorderPoint": 10, "reorderQty": 40, "supplier": "Basecamp Foods",
  "createdAt": "…", "updatedAt": "…"
}
```

### Orders

| Method | Path | Body / query | Notes |
|---|---|---|---|
| GET | `/api/orders` | `?status=` `?since=<ISO date>` `?limit=` (max 200) | Newest first |
| POST | `/api/orders` | see below | 201 new, 200 if `externalId` already exists |
| GET | `/api/orders/:id` | | `:id` is the order ID or `externalId` |
| POST | `/api/orders/:id/status` | `status, note?, carrier?, trackingNumber?` | `carrier` and `trackingNumber` apply when shipping |

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "x-api-key: $API_KEY" -H "content-type: application/json" \
  -d '{
    "customer": { "name": "Jordan Rivers", "email": "jordan@example.com" },
    "items": [ { "sku": "WB-750", "qty": 2 }, { "sku": "HL-300", "qty": 1 } ],
    "externalId": "shopify-1042",
    "note": "Gift wrap"
  }'
```

Duplicate SKUs in one order are merged. Response:

```json
{
  "id": "ord_1001", "externalId": "shopify-1042", "status": "reserved",
  "customer": { "name": "Jordan Rivers", "email": "jordan@example.com" },
  "items": [ { "productId": "prd_1001", "sku": "WB-750", "name": "Insulated Water Bottle 750 ml", "qty": 2, "unitPrice": 24.99, "lineTotal": 49.98 } ],
  "total": 88.98, "currency": "USD",
  "shortages": [],
  "shipping": { "carrier": null, "trackingNumber": null },
  "history": [ { "status": "reserved", "at": "…", "note": "Order created" } ],
  "duplicate": false
}
```

A backordered order has `"status": "backordered"` and `"shortages": [{ "sku": "MUG-ENM", "requested": 3, "available": 0, "short": 3 }]`.

Statuses: `backordered`, `reserved`, `paid`, `shipped`, `delivered`, `cancelled`. See [ARCHITECTURE.md](ARCHITECTURE.md#order-lifecycle) for allowed moves.

### Purchase orders

| Method | Path | Body / query | Notes |
|---|---|---|---|
| GET | `/api/purchase-orders` | `?status=open` or a status, `?sku=` | Newest first |
| POST | `/api/purchase-orders` | `sku, qty? \| atLeast?, reason?, supplier?, dedupe?` | 201 new, 200 + `duplicate: true` if one is already open |
| GET | `/api/purchase-orders/:id` | | |
| POST | `/api/purchase-orders/:id/status` | `status, note?` | `ordered`, `received`, `cancelled` |

### Webhook subscriptions (REST hooks)

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/hooks` | | Static routes plus dynamic hooks (secrets masked) |
| POST | `/api/hooks` | `targetUrl, events` (array, comma string or `"*"`) | 201; the response includes the hook's `secret`, shown only once |
| GET | `/api/hooks/:id` | | |
| DELETE | `/api/hooks/:id` | | `{ id, deleted: true }` |

`event` (singular) and `url` / `target_url` are accepted as aliases.

### Event log

| Method | Path | Query |
|---|---|---|
| GET | `/api/events` | `?type=order.created,inventory.low_stock` `?after=<ISO date>` `?limit=` (max 500) |

Newest first. Useful for polling tools, debugging, and the Zapier triggers' sample data.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `API_KEY` | (required) | Key for every `/api` call |
| `PORT` | `3000` | |
| `STORE_NAME` | `Trailhead Supply Co.` | Shown in `/api/me` and reports |
| `CURRENCY` | `USD` | |
| `DATA_FILE` | `./data/db.json` | `:memory:` for throwaway runs |
| `SEED_FILE` | `./data/seed.json` | Loaded once, when the store is empty |
| `WEBHOOK_SECRET` | (empty) | Signs static-route deliveries |
| `WEBHOOK_SUBSCRIPTIONS` | (empty) | Static event routes, see ARCHITECTURE.md |
| `WEBHOOK_RETRIES` | `3` | Retries after the first attempt |
| `WEBHOOK_BACKOFF_MS` | `500` | First retry delay, doubled each time |
| `WEBHOOK_TIMEOUT_MS` | `5000` | Per-attempt timeout |
| `EVENT_LOG_LIMIT` | `500` | Events kept for `/api/events` |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`, `silent` |
