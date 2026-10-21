# Make custom app (optional, reference)

Files are IMLJSON (JSON with `{{ }}` expressions and `//` comments). Paste each into the matching place in Make's custom app editor, or open the app in VS Code with the Make Apps Editor extension.

| File | Where it goes in Make |
|---|---|
| `base.imljson` | App → **Base** |
| `connection/parameters.imljson` | Connection → **Parameters** (type: Basic) |
| `connection/communication.imljson` | Connection → **Communication** |
| `webhook/parameters.imljson` | Webhook (type: Dedicated, attached) → **Parameters** |
| `webhook/communication.imljson` | Webhook → **Communication** |
| `webhook/attach.imljson` | Webhook → **Attach** |
| `webhook/detach.imljson` | Webhook → **Detach** |
| `modules/watchEvents/*` | Module type **Instant trigger**, linked to the webhook above: Interface, Samples |
| `modules/createOrder/*` | Module type **Action**: Communication, Mappable parameters, Interface |
| `modules/updateOrderStatus/*` | Module type **Action** |
| `modules/receivePurchaseOrder/*` | Module type **Action** (label it "Update purchase order") |

Notes:

- `{{connection.*}}` reads connection fields from Base. Inside the connection itself, use `{{parameters.*}}`.
- The attach step stores the API's hook id as `externalHookId`, which detach uses to unsubscribe.
- Running a custom app in a scenario requires a Make plan that includes premium apps. Building it is free.
- Written to Make's documented format, but not yet run in a live Make account. Treat it as a starting point and check it against the Custom Apps documentation.
