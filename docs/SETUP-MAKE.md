# Make setup

Two scenarios, which is exactly the Free plan's limit of 2 active scenarios. Both use only built-in Webhooks and HTTP modules, so no paid apps are needed.

| Blueprint | Trigger | What it does |
|---|---|---|
| `01-send-purchase-orders.blueprint.json` | Custom webhook (instant) | New purchase order → POST it to the supplier → mark the PO `ordered` in the API |
| `02-daily-low-stock-digest.blueprint.json` | Schedule (daily) | GET `/api/inventory/report` → if anything is low, post the digest to a Slack incoming webhook |

## 1. Give the API a public URL

Make's HTTP modules call the API back, so it needs to be reachable:

```bash
docker compose --profile tunnel up -d
docker compose logs tunnel | grep trycloudflare.com
```

(The API can always *send* to Make's webhook URL. The tunnel is for Make calling *in*.)

## 2. Scenario 1: send purchase orders to the supplier

1. In Make: **Create a new scenario → ⋯ (bottom toolbar) → Import Blueprint**, and choose `make/blueprints/01-send-purchase-orders.blueprint.json`.
2. Click the **Webhooks** module → **Add** → name it `Inventory events` → **Save**. Copy the URL it shows (`https://hook.<zone>.make.com/...`).
3. Point `purchase_order.created` at that URL, using **either**:
   - `.env` in the project root, then `docker compose up -d`:
     ```
     WEBHOOK_SUBSCRIPTIONS=order.created=http://n8n:5678/webhook/inv-order-created,inventory.low_stock=http://n8n:5678/webhook/inv-low-stock,purchase_order.created=https://hook.us1.make.com/YOUR-ID
     ```
   - or a REST hook, with no restart needed:
     ```bash
     curl -X POST "$TUNNEL/api/hooks" -H "x-api-key: $API_KEY" -H "content-type: application/json" \
       -d '{"targetUrl":"https://hook.us1.make.com/YOUR-ID","events":["purchase_order.created"]}'
     ```
4. Teach Make the payload shape: on the webhook module click **Redetermine data structure**, then create a purchase order:
   ```bash
   curl -X POST "$TUNNEL/api/purchase-orders" -H "x-api-key: $API_KEY" -H "content-type: application/json" -d '{"sku":"MUG-ENM"}'
   ```
   The module should say **Successfully determined**, and the `{{1.data.…}}` mappings light up.
5. **Module 2 (supplier):** replace the URL. For a demo, a free https://webhook.site URL lets you watch the PO arrive. In real life this is the supplier's API, an email module, or an EDI gateway.
6. **Module 3 (mark ordered):** replace `REPLACE-WITH-YOUR-TUNNEL` and `REPLACE-WITH-YOUR-API-KEY`.
7. Save, then switch the scenario **On**. Webhook scenarios run as soon as data arrives.

## 3. Scenario 2: daily low-stock digest

1. In Slack: create an app with **Incoming Webhooks** turned on, add one to a channel, and copy its URL.
2. Import `make/blueprints/02-daily-low-stock-digest.blueprint.json`.
3. **Module 1:** replace the tunnel URL and API key.
4. **Module 2:** paste the Slack webhook URL. The body is `{{1.data.slackMessageJson}}`: the API sends the Slack message already JSON-encoded, because pasting multi-line text into a JSON body by hand breaks it.
5. **Run once** to check, then open the scenario's schedule settings → **Every day** at 08:00 → switch it **On**.

## Credits on the Free plan (1,000 a month)

| Scenario | Credits per run | Typical month |
|---|---|---|
| Send purchase orders | About 3 (webhook + 2 HTTP calls) | 50 POs ≈ 150 |
| Daily digest | 1 to 2 | 30 days ≈ 60 |

That leaves plenty of headroom. Other Free plan limits to know about: a 15-minute minimum schedule interval, a 5-minute maximum run time, and 7 days of execution logs. Check the current numbers on Make's pricing page ([FREE-TIERS.md](FREE-TIERS.md)).

## If a blueprint import complains

Blueprints are built for the current HTTP app ("Make a request", the v4 module). If your account rejects the file, building by hand takes about five minutes:

**Scenario 1**
1. **Webhooks → Custom webhook** (steps 2–4 above)
2. **HTTP → Make a request:** POST to the supplier URL, body type JSON. Add a filter on the link before it: `1. type` *Equal to* `purchase_order.created`. Body:
   ```json
   { "poNumber": "{{1.data.id}}", "sku": "{{1.data.sku}}", "product": "{{1.data.productName}}", "quantity": {{1.data.qty}}, "supplier": "{{1.data.supplier}}" }
   ```
3. **HTTP → Make a request:** POST `<tunnel>/api/purchase-orders/{{1.data.id}}/status`, header `x-api-key`, body `{"status":"ordered","note":"Sent to supplier by Make"}`

**Scenario 2**
1. **HTTP → Make a request:** GET `<tunnel>/api/inventory/report`, header `x-api-key`, parse response: yes
2. Filter on the link: `1. data.lowStockCount` *Greater than* `0`
3. **HTTP → Make a request:** POST the Slack URL, body type JSON, body `{{1.data.slackMessageJson}}`

The hand-written JSON body in scenario 1 puts product names straight into JSON. A name containing a double quote would break it, which is why scenario 2 uses the pre-encoded field instead.

## Optional: the Make custom app (`make/custom-app`)

A custom app turns the API into a native Make app: a connection with an API-key test, an instant **Watch events** trigger that registers its own webhook (attach/detach via `/api/hooks`), and **Create order**, **Update order status** and **Update purchase order** actions.

- **Plan:** you can build custom apps on Free, but Make treats them as premium apps when they run in a scenario, so running one needs a paid plan.
- **Loading it:** in Make go to **Custom apps → Create a new app**, then paste each file into the matching tab (Base, Connection, Webhook, each module's Communication / Mappable parameters / Interface). Or use the **Make Apps Editor** extension for VS Code. File-to-tab mapping is in [`make/custom-app/README.md`](../make/custom-app/README.md).
- **Status:** a reference starting point, written to Make's documented component format but not run in a live Make account. Check it against the Custom Apps docs linked in [RESOURCES.md](RESOURCES.md).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Mappings show as plain text after import | Run step 4 (redetermine the data structure) so Make knows the payload |
| Module 3 returns 401 | Replace the API key placeholder |
| Module 3 returns 404 | Tunnel URL wrong or expired. Quick tunnels change on restart. |
| Scenario never fires | `GET /api/hooks` or your `WEBHOOK_SUBSCRIPTIONS` should include the Make URL for `purchase_order.created` |
| API logs show 429 from Make | Make rate-limits webhooks. The API retries 429s with backoff automatically. |
