# low_code_automation_sample

An inventory and order system split the way a small company would run it: **AWS Lambda owns the data and the rules, Make owns the connections to everything else.**

- **`backend/`**: the API, as Lambda functions behind API Gateway with DynamoDB (Serverless Framework v3, TypeScript). It runs locally the same way, using serverless-offline and DynamoDB Local.
- **`make/`**: Make scenario blueprints and an optional custom app that call the API.

```
Make scenarios ──HTTPS──> API Gateway ──> Lambda (products, orders, purchaseOrders, hooks, system) ──> DynamoDB
      ▲                                                                                                  │
      └──────── signed webhooks <── deliverEvents Lambda <── events table stream ───────────────────────┤
                                     reorder Lambda      <── (low stock and backorders raise POs) ───────┘
```

## Run it locally

You need Node 22+ and Docker Desktop.

```bash
cd backend
npm install
cp .env.example .env.local     # set API_KEY to a long random value
npm run db:up                  # DynamoDB Local in Docker (port 8000)
npm run dev                    # API on http://localhost:3000, plus the stream functions
```

In a second terminal:

```bash
cd backend
npm run demo                   # walks an order through the whole flow
npm test                       # 14 tests against DynamoDB Local
```

`npm run dev` creates the tables and seeds six products the first time. `npm run db:reset` starts over with fresh data.

To let Make call your local API, start a temporary public URL with `docker compose --profile tunnel up -d`, then read the URL from `docker compose logs tunnel`.

## Deploy to AWS

```bash
cd backend
npm run deploy                 # stage "dev"; see docs/DEPLOY-AWS.md first (secrets in SSM)
```

## Docs

| | |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the pieces fit: data model, events, stream functions, how local mimics AWS |
| [docs/API.md](docs/API.md) | Every endpoint, request and response |
| [docs/SETUP-MAKE.md](docs/SETUP-MAKE.md) | Importing the Make scenarios and pointing them at the API |
| [docs/DEPLOY-AWS.md](docs/DEPLOY-AWS.md) | Secrets, deploying, URLs, logs, removing a stage |
| [docs/FREE-TIERS.md](docs/FREE-TIERS.md) | What Make and AWS cost at this scale |
| [docs/RESOURCES.md](docs/RESOURCES.md) | Official documentation links |
