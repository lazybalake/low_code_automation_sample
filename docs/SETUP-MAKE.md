# Make setup

Two scenarios, which is exactly the Free plan's limit of 2 active scenarios. Both use only the built-in Webhooks and HTTP modules, so no paid apps are needed.

| Blueprint | Trigger | What it does |
|---|---|---|
| `01-send-purchase-orders.blueprint.json` | Custom webhook (instant) | New purchase order → POST it to the supplier → mark the PO `ordered` in the API |
| `02-daily-low-stock-digest.blueprint.json` | Schedule (daily) | GET `/api/inventory/report` → if anything is low, post the digest to a Slack incoming webhook |

The API answers from mock data (no database yet), so you can try both scenarios right away. `TM-12` and `MUG-ENM` start at or below their reorder points, so the digest always has something to post.

## 1. Get the API's URL

Make's HTTP modules call the API, so it needs a public HTTPS address.

- **Deployed:** `npm run info` in `backend/` prints the endpoint, e.g. `https://abc123.execute-api.us-east-1.amazonaws.com`. Use that ([DEPLOY-AWS.md](DEPLOY-AWS.md)).
- **Local:** with `npm run dev` running, start a temporary tunnel from the project root:
  ```bash
  docker compose up -d
  docker compose logs tunnel | grep trycloudflare.com
  ```
  Quick-tunnel URLs change every time the tunnel restarts.

Below, `$API` is that URL and `$API_KEY` is your key.

## 2. Scenario 1: send purchase orders to the supplier

1. In Make: **Create a new scenario → ⋯ (bottom toolbar) → Import Blueprint**, and choose `make/blueprints/01-send-purchase-orders.blueprint.json`.
2. Click the **Webhooks** module → **Add** → name it `Inventory events` → **Save**. Copy the URL it shows (`https://hook.<zone>.make.com/...`).
3. Point the API's events at that URL, using **either**:
   - `WEBHOOK_URL=https://hook.us1.make.com/YOUR-ID` in `backend/.env` (restart `npm run dev`), or in your shell before `npm run deploy`. The scenario's filter keeps only `purchase_order.created`.
   - or a hook, which needs no restart, but lives in memory with the mock data, so register it again after a restart:
     ```bash
     curl -X POST "$API/api/hooks" -H "x-api-key: $API_KEY" -H "content-type: application/json" \
       -d '{"targetUrl":"https://hook.us1.make.com/YOUR-ID","events":["purchase_order.created"]}'
     ```
4. Teach Make the payload shape: on the webhook module click **Redetermine data structure**, then create a purchase order:
   ```bash
   curl -X POST "$API/api/purchase-orders" -H "x-api-key: $API_KEY" -H "content-type: application/json" -d '{"sku":"TM-12"}'
   ```
   The module should say **Successfully determined**, and the `{{1.data.…}}` mappings light up.
5. **Module 2 (supplier):** replace the URL. For a demo, a free https://webhook.site URL lets you watch the PO arrive. In real life this is the supplier's API, an email module, or an EDI gateway.
6. **Module 3 (mark ordered):** replace `REPLACE-WITH-YOUR-API-URL` and `REPLACE-WITH-YOUR-API-KEY`.
7. Save, then switch the scenario **On**. Webhook scenarios run as soon as data arrives.

## 3. Scenario 2: daily low-stock digest

1. In Slack: create an app with **Incoming Webhooks** turned on, add one to a channel, and copy its URL.
2. Import `make/blueprints/02-daily-low-stock-digest.blueprint.json`.
3. **Module 1:** replace the API URL and API key.
4. **Module 2:** paste the Slack webhook URL. The body is `{{1.data.slackMessageJson}}`. The API sends the Slack message already JSON-encoded, because pasting multi-line text into a JSON body by hand breaks it.
5. **Run once** to check, then open the scenario's schedule settings → **Every day** at 08:00 → switch it **On**.

## Credits

| Scenario | Credits per run | Typical month |
|---|---|---|
| Send purchase orders | About 3 (webhook + 2 HTTP calls) | 50 POs ≈ 150 |
| Daily digest | 1 to 2 | 30 days ≈ 60 |

That fits the Free plan's 1,000 credits. See [FREE-TIERS.md](FREE-TIERS.md).

## If a blueprint import complains

Blueprints are built for the current HTTP app ("Make a request", the v4 module). If your account rejects the file, building the scenarios by hand takes about five minutes:

**Scenario 1**
1. **Webhooks → Custom webhook** (steps 2–4 above)
2. **HTTP → Make a request:** POST to the supplier URL, body type JSON. Add a filter on the link before it: `1. type` *Equal to* `purchase_order.created`. Body:
   ```json
   { "poNumber": "{{1.data.id}}", "sku": "{{1.data.sku}}", "product": "{{1.data.productName}}", "quantity": {{1.data.qty}}, "supplier": "{{1.data.supplier}}" }
   ```
3. **HTTP → Make a request:** POST `$API/api/purchase-orders/{{1.data.id}}/status`, header `x-api-key`, body `{"status":"ordered","note":"Sent to supplier by Make"}`

**Scenario 2**
1. **HTTP → Make a request:** GET `$API/api/inventory/report`, header `x-api-key`, parse response: yes
2. Filter on the link: `1. data.lowStockCount` *Greater than* `0`
3. **HTTP → Make a request:** POST the Slack URL, body type JSON, body `{{1.data.slackMessageJson}}`

The hand-written JSON body in scenario 1 puts product names straight into JSON. A name containing a double quote would break it, which is why scenario 2 uses the pre-encoded field instead.

## Optional: the Make custom app (`make/custom-app`)

A custom app turns the API into a native Make app. It has:
- A connection with an API-key test.
- An instant **Watch events** trigger that registers its own webhook (attach and detach through `/api/hooks`).
- **Create order**, **Update order status** and **Update purchase order** actions.

Notes:
- **Plan:** you can build custom apps on Free, but Make treats them as premium apps when they run in a scenario, so running one needs a paid plan.
- **Loading it:** in Make, go to **Custom apps → Create a new app**, then paste each file into the matching tab (Base, Connection, Webhook, and each module's Communication / Mappable parameters / Interface). Or use the **Make Apps Editor** extension for VS Code. The file-to-tab mapping is in [`make/custom-app/README.md`](../make/custom-app/README.md).
- **Status:** this is a reference starting point. It's written to Make's documented component format but hasn't been run in a live Make account. Check it against the Custom Apps docs linked in [RESOURCES.md](RESOURCES.md).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Mappings show as plain text after import | Run step 4 (redetermine the data structure) so Make knows the payload |
| Module 3 returns 401 | Replace the API key placeholder |
| Module 3 returns 404 | API URL wrong, or the quick tunnel restarted with a new URL |
| Scenario never fires | Check `WEBHOOK_URL`, or register the hook again: hooks live in memory and are lost on a restart (or a Lambda cold start) |
| API logs show `Webhook to … failed` | Make's webhook URL is wrong, or the scenario is off. The API tries each delivery once |
