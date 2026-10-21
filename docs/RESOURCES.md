# Official documentation

Links to each platform's own docs, grouped by what you'd be researching. Every link was checked on **October 21, 2026** and goes to the vendor's site or official GitHub. Descriptions are short summaries, not copies of the docs.

n8n is partway through moving its docs to new `/build/`, `/deploy/` and `/connect/` paths. If a link here 404s later, search docs.n8n.io for the page title.

## n8n

**Start here**
- [n8n Docs](https://docs.n8n.io/): documentation home
- [Plans and pricing](https://n8n.io/pricing/): cloud and self-hosted plans, execution quotas, trial terms
- [Host n8n](https://docs.n8n.io/deploy/host-n8n): self-hosting hub; an instance without a license runs as the free Community Edition
- [Compare editions](https://docs.n8n.io/deploy/host-n8n/community-edition-features): what Community, Registered Community, Business and Enterprise include

**Running it in Docker**
- [Install using Docker Compose](https://docs.n8n.io/deploy/host-n8n/install-options/install-using-docker-compose): the recommended self-hosted setup
- [Install with Docker](https://docs.n8n.io/deploy/host-n8n/install-options/install-with-docker): single-container setup with SQLite or Postgres
- [Docker Compose server setup](https://docs.n8n.io/hosting/installation/server-setups/docker-compose/): a Linux server with Compose, an `.env` file and Traefik for HTTPS
- [Use environment variables](https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables): index of every configuration variable
- [Manage settings with environment variables](https://docs.n8n.io/deploy/host-n8n/configure-n8n/manage-settings-using-environment-variables): owner setup, security, community packages
- [Use the command line](https://docs.n8n.io/deploy/host-n8n/configure-n8n/use-the-command-line): CLI reference, including `import:workflow`

**Nodes used in the workflows**
- [Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/): start a workflow from an HTTP call; test vs production URLs
- [Respond to Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/): control the HTTP response
- [HTTP Request](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/): call any REST API, with auth and pagination
- [If](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.if/): true/false branching
- [Code](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code/): JavaScript or Python steps
- [HTTP Request credentials](https://docs.n8n.io/integrations/builtin/credentials/httprequest/): Header Auth, Bearer, Basic and other generic credential types

**Managing workflows**
- [Export and import](https://docs.n8n.io/build/manage-workflows/export-and-import): moving workflows as JSON (copy-paste, menu, CLI, API)
- [Handle errors gracefully](https://docs.n8n.io/build/flow-logic/handle-errors-gracefully): error workflows and Stop and Error
- [Error Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.errortrigger): starts an error workflow when another workflow fails

**Building custom nodes (what `n8n/custom-node` is)**
- [Create nodes](https://docs.n8n.io/connect/create-nodes): index for planning, building, testing and shipping nodes
- [Tutorial: declarative-style node](https://docs.n8n.io/connect/create-nodes/build-your-node/tutorial-build-a-declarative-style-node): the style the **Inventory** node uses; also covers the `n8n` field in `package.json`
- [Tutorial: programmatic-style node](https://docs.n8n.io/connect/create-nodes/build-your-node/tutorial-build-a-programmatic-style-node): the style the **Inventory Trigger** uses
- [Choose node file structure](https://docs.n8n.io/connect/create-nodes/plan-your-node/choose-node-file-structure): folder layout and versioning
- [Building community nodes](https://docs.n8n.io/integrations/community-nodes/building-community-nodes): package standards, the `n8n` attribute, naming and keywords
- [Using the n8n-node tool](https://docs.n8n.io/connect/create-nodes/build-your-node/using-the-n8n-node-tool): `@n8n/node-cli` scaffolding, lint, dev and release
- [Run your node locally](https://docs.n8n.io/connect/create-nodes/test-your-node/run-your-node-locally): `npm run dev` with hot reload
- [n8n-io/n8n-nodes-starter](https://github.com/n8n-io/n8n-nodes-starter): the official starter repo
- [Submit community nodes](https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes): publishing to npm and getting verified (GitHub Actions publishing required since May 2026)
- [Verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines): what a node needs to be verified

**License**
- [Community license](https://docs.n8n.io/n8n-community-license): n8n's fair-code licensing explained
- [License FAQ](https://docs.n8n.io/n8n-community-license/community-license/license-faq): what you can and can't do
- [LICENSE.md](https://github.com/n8n-io/n8n/blob/master/LICENSE.md): full Sustainable Use License text

## Zapier

**Plans**
- [Plans and pricing](https://zapier.com/pricing)
- [What's included in the Free plan](https://help.zapier.com/hc/en-us/articles/32337438839565-What-s-included-in-Zapier-s-Free-plan)
- [Zap limits](https://help.zapier.com/hc/en-us/articles/8496181445261-Zap-limits): operational limits on Zaps
- [How task usage is measured](https://help.zapier.com/hc/en-us/articles/8496196837261-How-is-task-usage-measured-in-Zapier): only successful action steps count

**Built-in tools**
- [Using Code by Zapier](https://help.zapier.com/hc/en-us/articles/45405528551181-Using-Code-by-Zapier): JavaScript or Python steps and their per-plan limits
- [How Code by Zapier usage is measured](https://help.zapier.com/hc/en-us/articles/45885581698573-How-is-Code-by-Zapier-usage-measured)
- [Get started with Webhooks by Zapier](https://help.zapier.com/hc/en-us/articles/8496083355661-How-to-get-started-with-Webhooks-by-Zapier): sending and receiving webhooks (paid plans)
- [Trigger Zaps from webhooks](https://help.zapier.com/hc/en-us/articles/8496288690317-Trigger-Zap-workflows-from-webhooks): Catch Hook triggers (paid plans)

**Building integrations (what `zapier/` is)**
- [Developer documentation home](https://docs.zapier.com/integrations): visual builder and CLI
- [CLI tutorial](https://docs.zapier.com/integrations/quickstart/cli-tutorial): build, test and deploy a first integration
- [CLI overview](https://docs.zapier.com/integrations/build-cli/overview): project structure, auth, triggers, actions, HTTP middleware
- [CLI command reference](https://github.com/zapier/zapier-platform/blob/main/packages/cli/docs/cli.md): every `zapier-platform` command
- [Schema reference](https://github.com/zapier/zapier-platform/blob/main/packages/schema/docs/build/schema.md): every field allowed in an integration definition
- [Triggers: polling vs REST hooks](https://docs.zapier.com/integrations/build/trigger)
- [REST hook triggers in the CLI](https://docs.zapier.com/platform/build/cli-hook-trigger): subscribe, unsubscribe, perform, performList
- [Authentication overview](https://docs.zapier.com/integrations/build/auth)
- [API key authentication](https://docs.zapier.com/platform/build/apikeyauth)
- [Custom authentication in the CLI](https://docs.zapier.com/integrations/build-cli/overview#custom)
- [Testing and debugging](https://docs.zapier.com/integrations/build-cli/testing-and-debugging): `invoke`, Jest, mocks, CI
- [Private vs public integrations](https://docs.zapier.com/platform/quickstart/private-vs-public-integrations)
- [Sharing an integration](https://docs.zapier.com/platform/manage/sharing): invite links and email invites
- [Publishing requirements](https://docs.zapier.com/integrations/publish/integration-publishing-requirements): what a public listing needs
- [zapier/zapier-platform](https://github.com/zapier/zapier-platform): CLI, core and schema source, plus example apps (see `example-apps/rest-hooks`)

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

## The tools this boilerplate also uses

- [Express 5](https://expressjs.com/): the API's web framework
- [Node.js test runner](https://nodejs.org/api/test.html): the API's tests (`node --test`)
- [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/): the free `trycloudflare.com` URL the compose `tunnel` profile uses
- [Set up Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/get-started/): a named tunnel, for a URL that doesn't change
- [Slack incoming webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/): where Make's daily digest posts
