# n8n setup

n8n runs self-hosted in Docker next to the API, using the free Community Edition. Tested against **n8n 2.44.5** (October 2026).

## 1. Start it

```bash
cp .env.example .env                                   # project root; set API_KEY and WEBHOOK_SECRET
(cd n8n/custom-node && npm install && npm run build)   # only needed for workflow 03 / the custom nodes
docker compose up -d
```

Open http://localhost:5678 and create the owner account (it's local to your machine).

What `docker-compose.yml` sets for n8n, and why:

| Variable | Why |
|---|---|
| `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` | Workflows read `$env.INVENTORY_API_URL`. n8n 2.x blocks `$env` unless this is exactly `false`. |
| `INVENTORY_API_URL=http://app:3000` | How n8n reaches the API on the Docker network |
| `WEBHOOK_URL=http://n8n:5678/` | Webhook URLs n8n gives out, reachable from the API container |
| `N8N_CUSTOM_EXTENSIONS=/opt/n8n-custom` | Loads `n8n/custom-node/dist` (mounted read-only) |
| `INVENTORY_WEBHOOK_SECRET`, `NODE_FUNCTION_ALLOW_BUILTIN=crypto` | For the optional signature check in workflow 01 |

## 2. Create the credential

Workflows 01 and 02 use n8n's built-in HTTP Request node with Header Auth.

1. **Credentials → Add credential → Header Auth**
2. Name it exactly **`Inventory API key`** (the workflows find it by name on import)
3. Header name: `x-api-key`, value: your `API_KEY`

For workflow 03 (custom nodes), also add an **Inventory API** credential named **`Inventory API`**, with Base URL `http://app:3000` and your API key. Its **Test** button calls `/api/me`.

## 3. Import the workflows

In the editor: **Create workflow → ⋯ menu → Import from File**, and pick a file from `n8n/workflows/`. You can also paste the JSON straight onto the canvas.

Or import all of them from the command line:

```bash
docker compose cp n8n/workflows n8n:/home/node/workflows
docker compose exec n8n n8n import:workflow --separate --input=/home/node/workflows
```

| File | What it does |
|---|---|
| `01-order-intake.json` | `order.created` → if backordered, one purchase order per short SKU (`atLeast` = shortfall); otherwise a "Ready to pick" placeholder |
| `02-low-stock-reorder.json` | `inventory.low_stock` → if no PO is open, create one for the suggested quantity |
| `03-low-stock-reorder-custom-nodes.json` | Same job as 02 with the custom **Inventory Trigger** and **Inventory** nodes. Use 02 *or* 03, not both. |

Open each imported workflow and check the HTTP Request nodes picked up the `Inventory API key` credential. If one shows a warning, select the credential from the dropdown.

## 4. Publish

n8n 2.x calls turning a workflow on **Publish** (it was "Activate" in 1.x). Production webhook URLs only answer while a workflow is published.

The API already sends to these production paths (from `WEBHOOK_SUBSCRIPTIONS` in compose):

- `http://n8n:5678/webhook/inv-order-created` → workflow 01
- `http://n8n:5678/webhook/inv-low-stock` → workflow 02

Workflow 03 needs no route: publishing it makes the trigger register its own webhook through `POST /api/hooks`, and unpublishing removes it. Check with `GET /api/hooks`.

## 5. Try it

```bash
cd app && API_KEY=<your key> npm run demo
```

Then open **Executions** in n8n. The camp-mug order should run workflow 01's backorder branch, and the trail-mix order should trigger workflow 02.

To test a workflow before publishing it, click **Listen for test event** on the webhook node and post a sample payload to the test URL:

```bash
curl -X POST http://localhost:5678/webhook-test/inv-order-created \
  -H "content-type: application/json" --data @n8n/samples/order-created-backordered.json
```

`n8n/samples/` has real payloads for a reserved order, a backordered order and a low-stock alert.

## The custom nodes (`n8n/custom-node`)

A package named `n8n-nodes-inventory`, built with n8n's official `@n8n/node-cli`:

- **Inventory** (declarative style): Product (get, get many, adjust stock, get low stock), Order (create, get, get many, update status) and Purchase Order (create, get many, update status). Order line items can come from fields or a JSON array mapped from a previous node. It's marked `usableAsTool`, so an n8n AI Agent can call it too.
- **Inventory Trigger** (programmatic style): pick events and it subscribes itself on publish. It verifies each delivery's signature with the per-hook secret, and returns 401 if the signature doesn't match.

```bash
cd n8n/custom-node
npm install
npm run build      # n8n-node build → dist/
npm run lint       # n8n's community-node rules
npm run dev        # n8n-node dev: a local n8n with hot reload (needs Node 24+, like n8n itself)
```

Nodes loaded from a custom folder appear in workflow JSON as `CUSTOM.inventory` and `CUSTOM.inventoryTrigger`. If you later install the package from npm as a community node, the type becomes `n8n-nodes-inventory.inventory`. Re-import or reselect the nodes if you switch.

To publish it as a community node, replace the placeholder `author` and `homepage` in `package.json`, then follow n8n's submission guide (linked in [RESOURCES.md](RESOURCES.md)). Since May 2026, n8n requires community nodes to be published from GitHub Actions.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `access to env vars denied` | `N8N_BLOCK_ENV_ACCESS_IN_NODE` must be the string `false` on the n8n service. Restart after changing it. |
| API logs `rejected order.created with 404` | The workflow isn't published, or its webhook path changed |
| HTTP Request node returns 401 | The `Inventory API key` credential's header must be `x-api-key` with your exact `API_KEY` |
| `npm install` in `n8n/custom-node` fails with `gyp ERR!` | The included `.npmrc` skips native builds (`isolated-vm`, pulled in by `n8n-workflow`, only compiles on Node 24+). Keep that file, or use Node 24. |
| Custom nodes missing from the node panel | Run `npm run build` in `n8n/custom-node`, then `docker compose restart n8n` |
| Workflow 03 says "node type not known" | Same as above. The workflow uses the `CUSTOM.` prefix. |
| "Verify signature" fails with `Cannot find module 'crypto'` | The task runner needs `NODE_FUNCTION_ALLOW_BUILTIN=crypto` (set in compose). Leave the node disabled if you don't need it on the internal Docker network. |
| Editor login loops over plain http from another machine | Uncomment `N8N_SECURE_COOKIE: "false"` in compose, or use HTTPS |
