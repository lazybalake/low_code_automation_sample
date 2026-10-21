# Architecture

## The one rule

**The API owns the data. Make owns the connections to everything else** (suppliers, Slack, email). Make reads and changes data only through the API, and the API tells Make when something changes.

```
Make (custom app, scenarios) ──HTTPS──> API Gateway ──> Lambda "api" (src/handler.ts) ──> mock data (src/mockData.ts)
      ▲                                                        │
      └──────────────── webhook events (order.created, ...) ───┘
```

## The backend is two files

| File | What it is |
|---|---|
| `backend/src/handler.ts` | The Lambda. A table of routes (`"POST /api/orders"` → the code that answers it), the API-key check, JSON in and out, and `notify()`, which sends events to Make |
| `backend/src/mockData.ts` | Six products, two orders and a purchase order, kept in memory |
| `backend/serverless.yml` | The function and the routes API Gateway matches before calling it |

### How a request flows

1. API Gateway (serverless-offline locally) matches the route and calls the `api` Lambda with `event.routeKey`, e.g. `"POST /api/orders/{id}/status"`.
2. `handler` checks the `x-api-key`, parses the JSON body, and runs the entry for that route key.
3. The route reads or changes the mock data. If something changed, `notify()` POSTs an event to Make.
4. The result goes back as JSON: 201 for something new, 200 otherwise, or `{ error: { message } }`.

### What "in memory" means

- **Locally**, changes last until `npm run dev` stops.
- **In AWS**, each Lambda container keeps its own copy. A cold start resets it to the mock data. That's fine for explaining and demoing.
- **Adding a database later** means replacing `mockData.ts` and the lines in `handler.ts` that read and write it. The routes and the Make side stay the same.

## How Make connects

| Make piece | Uses |
|---|---|
| Custom app connection | `GET /api/me` with the API key |
| Custom app "Watch events" trigger | `POST /api/hooks` when a scenario starts, `DELETE /api/hooks/:id` when it stops. Events arrive at Make's webhook URL |
| Custom app actions | `POST /api/orders`, `POST /api/orders/:id/status`, `POST /api/purchase-orders/:id/status` |
| Blueprint 01 (send POs to the supplier) | A Make custom webhook set as `WEBHOOK_URL`; then `POST /api/purchase-orders/:id/status` |
| Blueprint 02 (daily digest) | `GET /api/inventory/report` |

## Retries are safe where it matters

Make retries failed steps. Creating an order with the same `externalId` twice returns the first order instead of a duplicate. Setting a status twice just sets it again.

## Deliberately left out for now

Stock reservations, backorders, low-stock alerts, signed webhooks and delivery retries. These belong in the backend once there's real data and a database. The `dynamodb` work in git history (commit `7d70f2c`) is a starting point.
