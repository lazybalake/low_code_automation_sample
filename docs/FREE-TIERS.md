# Free tiers (checked October 21, 2026)

Plans change. Check the official pricing pages before you rely on a number.

## n8n: free when self-hosted

| | |
|---|---|
| **Community Edition (self-hosted)** | Free, with no execution limit from n8n. You run the server (here, Docker). Features like SSO and Git-based environments need a paid license. |
| **n8n Cloud** | No permanent free tier, only a free trial of the Starter and Pro plans. Paid cloud plans start around €20/month (billed annually) for 2,500 executions. |
| **Pricing page** | https://n8n.io/pricing/ |
| **Editions compared** | https://docs.n8n.io/deploy/host-n8n/community-edition-features |

**How this boilerplate fits:** n8n carries the logic-heavy, high-volume flows (every order, every low-stock alert) because self-hosting removes the meter.

## Zapier: free forever, small

| | |
|---|---|
| **Tasks** | 100 a month, shared with Zapier MCP actions. Only successful action steps count. |
| **Zap shape** | Two steps: one trigger, one action. Unlimited Zaps. |
| **Polling** | Every 15 minutes for polling triggers |
| **Apps** | No premium apps. Webhooks by Zapier needs a paid plan. |
| **Code by Zapier** | Available, with a 1-second runtime limit on Free |
| **Extras** | Tables (2,500 records) and Forms (10 pages), whose steps don't use tasks |
| **Next plan** | Professional, from $19.99/month billed annually |
| **Pricing page** | https://zapier.com/pricing |
| **Free plan details** | https://help.zapier.com/hc/en-us/articles/32337438839565-What-s-included-in-Zapier-s-Free-plan |

**How this boilerplate fits:** every suggested Zap is exactly two steps, and the API pre-formats fields (`itemsSummary`, `trackingNumber`) so no Formatter step is needed. The private CLI integration replaces the paid Webhooks app and pushes events instantly through REST hooks.

## Make: free forever, credit-metered

| | |
|---|---|
| **Credits** | 1,000 a month. Most module actions cost 1 credit; AI and some advanced features cost more. |
| **Storage** | 1 data store, 1 MB |
| **Files** | 5 MB max file size |
| **Make Code** (JS/Python steps) | Paid plans only |
| **Custom apps** | You can build them on Free, but running one in a scenario counts as a premium app, so it needs a paid plan |
| **Also reported for Free** | 2 active scenarios, 15-minute minimum interval, 5-minute max run, 7-day logs. These come from third-party reviews and a Free account's license snapshot; Make's pricing page didn't display its plan table when checked. |
| **Next plan** | Core, reported from about $9/month billed annually for 10,000 credits |
| **Pricing page** | https://www.make.com/en/pricing |
| **Credits explained** | https://help.make.com/credits |

**How this boilerplate fits:** two scenarios, built only from the Webhooks and HTTP apps, using about 200 credits in a typical month. The custom app is included for when you move to a paid plan.

## Running all three for a portfolio demo

| | Monthly cost |
|---|---|
| API + n8n on your own computer (Docker) | $0 |
| Same on a small VPS, so it's always online | Roughly $4–7 for the server |
| Cloudflare quick tunnel | $0 (the URL changes on restart; a named tunnel or a VPS gives a stable URL) |
| Zapier Free + private integration | $0 |
| Make Free | $0 |
