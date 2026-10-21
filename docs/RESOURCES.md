# Official documentation

Links to each platform's own docs, grouped by what you'd be researching. Links were checked on **October 21, 2026** and go to the vendor's site or official GitHub. Descriptions are short summaries, not copies of the docs.

## AWS and the backend

**Running Lambda locally and deploying**
- [serverless.yml reference](https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml): every setting in `backend/serverless.yml` (Serverless Framework v3, the same version as the WebsiteManagement backend)
- [serverless-offline](https://github.com/dherault/serverless-offline): emulates API Gateway and Lambda on your machine (`npm run dev`)
- [serverless-esbuild](https://github.com/floydspace/serverless-esbuild): bundles the TypeScript function for deploy and for offline runs
- [HTTP API Lambda integrations](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html): the payload v2 event every route handler receives

**When the mock data becomes real data**
- [DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html): a local DynamoDB to develop against
- [DynamoDB transactions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html): all-or-nothing writes, for reserving stock across several products
- [DynamoDB Streams and Lambda](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.Lambda.html): delivering webhooks from a stream instead of inside the request
- [Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html): where `API_KEY` should live once the data is real

**Pricing**
- [AWS Free Tier](https://aws.amazon.com/free/)
- [Lambda pricing](https://aws.amazon.com/lambda/pricing/) · [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/) · [DynamoDB on-demand pricing](https://aws.amazon.com/dynamodb/pricing/on-demand/)

## Make

**Plans**
- [Pricing and subscription packages](https://www.make.com/en/pricing)
- [Credits](https://help.make.com/credits): how credits are counted
- [How features use credits](https://help.make.com/how-features-use-credits)

**Modules used in the blueprints**
- [Webhooks (Help Center)](https://help.make.com/webhooks): instant triggering, queues, logs, rate limits
- [Webhooks app](https://apps.make.com/gateway): Custom webhook and Webhook response modules
- [HTTP app](https://apps.make.com/http): Make a request, Download a file, Resolve URL
- [Make Code](https://apps.make.com/code): JavaScript or Python steps (paid plans)

**Running scenarios**
- [Scenario blueprints](https://help.make.com/blueprints): export and import scenarios as JSON
- [Schedule a scenario](https://help.make.com/schedule-a-scenario): run schedules and per-plan intervals
- [Overview of error handling](https://help.make.com/Overview-of-error-handling)
- [Error handlers](https://help.make.com/error-handlers): Skip, Retry, Resume, Commit, Rollback
- [Rollback error handler](https://help.make.com/rollback-error-handler)

**Building custom apps (what `make/custom-app` is)**
- [Custom Apps documentation](https://developers.make.com/custom-apps-documentation): home
- [Base](https://developers.make.com/custom-apps-documentation/app-components/base): shared URL, headers, error handling
- [Connections](https://developers.make.com/custom-apps-documentation/app-components/connections): Basic, JWT, OAuth types
- [Modules](https://developers.make.com/custom-apps-documentation/app-components/modules): action, search, triggers, universal, responder
- [Action modules](https://developers.make.com/custom-apps-documentation/app-components/modules/action)
- [Instant triggers](https://developers.make.com/custom-apps-documentation/app-components/modules/instant-trigger)
- [Webhooks (app component)](https://developers.make.com/custom-apps-documentation/app-components/webhooks): shared vs dedicated, attach and detach
- [Custom IML functions](https://developers.make.com/custom-apps-documentation/app-components/iml-functions): JavaScript helpers for expressions (Make enables them on request)
- [Make Apps Editor for VS Code](https://developers.make.com/custom-apps-documentation/get-started/make-apps-editor/apps-sdk)
- [Make API documentation](https://developers.make.com/api-documentation): REST API for scenarios, connections and more

## The other tools this project uses

- [Vitest](https://vitest.dev/): the backend's tests (`npm test`)
- [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/): the free `trycloudflare.com` URL the compose `tunnel` profile gives the local API
- [Set up Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/get-started/): a named tunnel, for a URL that doesn't change
- [Slack incoming webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/): where Make's daily digest posts
