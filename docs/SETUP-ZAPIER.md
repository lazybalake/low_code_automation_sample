# Zapier setup

Zapier talks to the API through a **private integration** built with the Zapier Platform CLI (`zapier/`). Building and hosting a private integration is free, and it works with Zapier's free plan.

Why not just use Webhooks by Zapier? It needs a paid plan. A CLI integration also gives you real instant triggers (REST hooks), dropdowns and readable errors.

## What it includes

| Type | Key | What it does |
|---|---|---|
| Trigger (instant) | `new_order` | An order is created |
| Trigger (instant) | `order_status_changed` | An order changes status; optional filter such as "shipped" |
| Trigger (instant) | `low_stock` | A product hits its reorder point |
| Action | `create_order` | Line items, `externalId` for retry-safe creation |
| Action | `update_order_status` | Paid, shipped (with carrier and tracking), delivered, cancelled |
| Action | `adjust_stock` | Plus or minus units, with a reason |
| Action | `create_purchase_order` | Deduplicated per product |
| Action | `update_purchase_order` | Ordered, received (adds stock), cancelled |
| Search | `find_product`, `find_order` | By SKU, or by order ID / External ID |

Every order output includes flat `customerName`, `customerEmail`, `itemsSummary`, `carrier` and `trackingNumber` fields, so two-step Zaps can write emails without a Formatter step.

## 1. Give the API a public URL

Zapier runs in the cloud, so the API needs an HTTPS URL:

```bash
docker compose --profile tunnel up -d
docker compose logs tunnel | grep trycloudflare.com
```

Quick-tunnel URLs change every time the tunnel restarts. When yours changes, reconnect the account in Zapier. Any HTTPS tunnel or host works.

## 2. Install, test, push

Needs Node 22 (the version Zapier runs integrations on).

```bash
npm install -g zapier-platform-cli     # v19 installs the `zapier-platform` command
cd zapier
npm install

cp .env.example .env                   # TEST_BASE_URL and TEST_API_KEY for a running API
npm test                               # 11 tests against the live API
npm run validate                       # schema plus Zapier's publishing checks

zapier-platform login
zapier-platform register "Trailhead Inventory"   # creates the private integration (once)
zapier-platform push                             # uploads this version
```

## 3. Connect your account

In Zapier, start a Zap, search for **Trailhead Inventory** (or whatever name you registered) and connect:

- **API Base URL:** your tunnel URL, for example `https://something.trycloudflare.com`
- **API Key:** your `API_KEY`

The connection is labeled with your store name from `/api/me`.

## 4. Zaps to build (all two steps, so they fit the free plan)

| Zap | Trigger | Action |
|---|---|---|
| Order confirmation | Trailhead Inventory · **New Order** | Gmail · Send Email to `Customer Email` with `Items Summary` and `Total` |
| Shipping notice | **Order Status Changed**, New Status = `shipped` | Gmail · Send Email with `Carrier` and `Tracking Number` |
| Form intake | Zapier Forms · New Submission | Trailhead Inventory · **Create Order** (map the form's submission ID to External ID) |

Optional: **Low Stock** → Slack · Send Channel Message.

Turning a Zap on calls `POST /api/hooks`, and turning it off calls `DELETE`. Check what's subscribed with `GET /api/hooks`.

## Free plan notes

- 100 tasks a month. Only successful action steps count, not triggers. The order confirmation and shipping notice Zaps use 2 tasks per order between them, so roughly 50 orders a month.
- Zaps are limited to one trigger and one action. Every Zap above is designed for that.
- Forms and Tables steps don't use tasks.
- Polling triggers check every 15 minutes on Free. The three triggers here are REST hooks, so the API pushes to Zapier instead of waiting to be polled.

## Sharing it

Private integrations can be shared with specific people (for example an interviewer) from the integration's **Sharing** page in Zapier's developer platform, or by `zapier-platform users:add`. Publishing it publicly in the app directory requires meeting Zapier's publishing requirements; see [RESOURCES.md](RESOURCES.md).

## Troubleshooting

| Symptom | Fix |
|---|---|
| "The API key was rejected" | Reconnect with the exact `API_KEY` |
| Connection test times out | Zapier can't reach the URL: check the tunnel is up and the URL starts with `https://` |
| Zap never fires | `GET /api/hooks` should list a `hooks.zapier.com` target. If not, turn the Zap off and on. |
| Hook vanished after you deleted a Zap | Expected: Zapier replies 410 and the API removes the subscription |
| `zapier-platform` not found | CLI v19 removed the old `zapier` command. Use `zapier-platform`. |
