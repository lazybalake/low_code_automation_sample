# Make

- `blueprints/01-send-purchase-orders.blueprint.json`: new purchase order → supplier → mark ordered
- `blueprints/02-daily-low-stock-digest.blueprint.json`: daily inventory report → Slack
- `custom-app/`: optional native Make app for the API (running it needs a paid plan)

Both blueprints use only the free Webhooks and HTTP apps and fit the Free plan's 2 active scenarios. Search the files for `REPLACE` to find the placeholders (tunnel URL, API key, supplier URL, Slack URL).

Setup guide: [../docs/SETUP-MAKE.md](../docs/SETUP-MAKE.md)
