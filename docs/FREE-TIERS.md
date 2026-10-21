# What it costs (checked October 21, 2026)

Plans change. Check the official pricing pages before you rely on a number.

## Make: free forever, credit-metered

| | |
|---|---|
| **Credits** | 1,000 a month. Most module actions cost 1 credit, triggers included; AI and some advanced features cost more. |
| **Storage** | 1 data store, 1 MB |
| **Files** | 5 MB max file size |
| **Make Code** (JS/Python steps) | Paid plans only, 2 credits per second of runtime. Custom logic is cheaper as an HTTP call to the backend |
| **Custom apps** | You can build them on Free, but running one in a scenario counts as a premium app, so it needs a paid plan |
| **Also reported for Free** | 2 active scenarios, 15-minute minimum interval, 5-minute max run, 7-day logs. These come from third-party reviews; Make's pricing page didn't display its plan table when checked. |
| **Next plans** | Core about $9/month, Pro about $16, Teams about $29 (billed annually, 10,000 credits). Higher credit volumes cost more |
| **Pricing page** | https://www.make.com/en/pricing |
| **Credits explained** | https://help.make.com/credits |

**How this project fits:** two scenarios, built only from the Webhooks and HTTP apps, using about 200 credits in a typical month. Restocking decisions run in Lambda, so they use no credits.

## AWS: the backend

| | |
|---|---|
| **Lambda** | Always free: 1M requests and 400,000 GB-seconds a month. This project's function uses 256 MB on arm64 |
| **API Gateway (HTTP API)** | About $1 per million requests |
| **CloudWatch Logs** | Small at this volume; logs are kept 30 days |
| **Database** | None yet: the API answers from mock data. When one is added, DynamoDB on-demand costs about $0.625 per million writes and $0.125 per million reads |
| **New accounts** | Accounts opened since July 15, 2025 choose a Free plan (credits, up to 6 months) or a Paid plan; the always-free allowances apply on both |
| **Pricing pages** | https://aws.amazon.com/lambda/pricing/ · https://aws.amazon.com/api-gateway/pricing/ · https://aws.amazon.com/dynamodb/pricing/on-demand/ · https://aws.amazon.com/free/ |

**How this project fits:** each API call is one Lambda invocation, so a demo stays well inside Lambda's free tier.

## Running it

| | Monthly cost |
|---|---|
| Backend locally (serverless-offline) | $0 |
| Cloudflare quick tunnel, so Make can reach the local API | $0 (the URL changes on restart) |
| Backend deployed to AWS, demo volume | About $0 to $1 |
| Make Free | $0 |
| Make paid, as volume grows | From about $9 (Core) |
