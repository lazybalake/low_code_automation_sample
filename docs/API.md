# API reference

Base URL:
- `http://localhost:3000` locally (`npm run dev`)
- The tunnel URL when Make calls your local API
- `https://<api-id>.execute-api.<region>.amazonaws.com` once deployed (`npm run info` prints it)

Responses come from mock data in memory (`backend/src/mockData.ts`). Changes last until the server (or Lambda container) restarts.

## Authentication

Every route except `/health` needs the API key in a header:

```
x-api-key: <API_KEY>
```

`Authorization: Bearer <API_KEY>` works too. Paths start with `/api` (`https://<api-id>.execute-api.<region>.amazonaws.com/api/me`); only `/health` doesn't.

## Errors

```json
{ "error": { "message": "Order \"ord_9999\" not found" } }
```

| Status | Meaning |
|---|---|
| 400 | Missing or invalid field, or a body that isn't JSON |
| 401 | Missing or wrong API key |
| 404 | Unknown product, order, purchase order or route |
| 500 | A bug (see the logs) |

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | | `{ ok }`, no key needed |
| GET | `/api/me` | | `{ ok, storeName }`, the custom app's connection test |
| GET | `/api/products` | | All products |
| GET | `/api/products/:sku` | | One product (SKU in any case) |
| GET | `/api/orders` | | All orders |
| GET | `/api/orders/:id` | | One order, by ID or `externalId` |
| POST | `/api/orders` | `customer: { name, email }, items: [{ sku, qty }], externalId?, note?` | 201 + the order. A repeated `externalId` returns the existing order with 200 |
| POST | `/api/orders/:id/status` | `status, carrier?, trackingNumber?` | The order. `status`: `reserved`, `paid`, `shipped`, `delivered`, `cancelled` |
| GET | `/api/purchase-orders` | | All purchase orders |
| POST | `/api/purchase-orders` | `sku, qty?` | 201 + the PO (`qty` defaults to the product's `reorderQty`) |
| POST | `/api/purchase-orders/:id/status` | `status` | The PO. `status`: `requested`, `ordered`, `received` (adds the quantity to stock), `cancelled` |
| GET | `/api/inventory/report` | | `{ storeName, lowStockCount, lowStock, lowStockText, slackMessageJson }` |
| POST | `/api/hooks` | `targetUrl, events` (array or comma string, `*` for all) | 201 + `{ id, targetUrl, events }`. Used by the custom app's "Watch events" |
| DELETE | `/api/hooks/:id` | | `{ id, deleted: true }` |

Example:

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "x-api-key: $API_KEY" -H "content-type: application/json" \
  -d '{ "customer": { "name": "Jordan Rivers", "email": "jordan@example.com" }, "items": [ { "sku": "WB-750", "qty": 2 } ], "externalId": "shop-1042" }'
```

## Webhook events

When something changes, the API POSTs `{ id, type, createdAt, data }` to `WEBHOOK_URL` (if set) and to every registered hook that wants that type:

| Event | `data` |
|---|---|
| `order.created` | The order |
| `order.status_changed` | `{ from, to, order }` |
| `purchase_order.created` | The purchase order |
| `purchase_order.status_changed` | `{ from, to, purchaseOrder }` |

## Environment variables

Set in `serverless.yml`; values come from `backend/.env` for every command (`dev`, `deploy`), and a value already set in your shell wins.

| Variable | Default | Purpose |
|---|---|---|
| `API_KEY` | (required) | Key for every route except `/health` |
| `STORE_NAME` | `Trailhead Supply Co.` | Shown in `/api/me` and the report |
| `WEBHOOK_URL` | (empty) | A Make custom webhook that receives every event |
