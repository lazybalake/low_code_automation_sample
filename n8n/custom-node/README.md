# n8n-nodes-inventory

n8n nodes for the inventory and order flow API.

- **Inventory**: products (get, get many, adjust stock, low stock), orders (create, get, get many, update status), purchase orders (create, get many, update status). Declarative style; works as an AI Agent tool.
- **Inventory Trigger**: choose events; publishing the workflow subscribes it through `POST /api/hooks`, unpublishing removes the subscription. Verifies each delivery's HMAC signature.
- **Inventory API** credential: Base URL + API key, tested against `/api/me`.

```bash
npm install
npm run build    # → dist/, which docker-compose mounts into n8n
npm run lint
npm run dev      # local n8n with hot reload (Node 24+)
```

Setup and troubleshooting: [../../docs/SETUP-N8N.md](../../docs/SETUP-N8N.md)

Before publishing to npm, replace the placeholder `author` and `homepage` in `package.json`.
