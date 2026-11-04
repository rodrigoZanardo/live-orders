# Webhooks

Live Orders takes orders **in** from a delivery platform and pushes every order event **out** to the URLs an admin registers. Both directions use the same signing scheme.

## Signing scheme

```
X-Timestamp: <unix seconds>
X-Signature: sha256=<hex of HMAC-SHA256(secret, "<timestamp>.<raw body>")>
```

- The signature covers the **raw** body bytes, so check it before parsing JSON.
- Compare with a constant-time function (`crypto.timingSafeEqual` in Node).
- Refuse a timestamp more than **5 minutes** away from your clock (replay protection).

Signing in Node:

```js
import { createHmac } from 'node:crypto';
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
```

Signing with curl and openssl:

```bash
BODY='{"externalId":"demo-1","customerName":"Ana","items":[{"sku":"KB-001","name":"Keyboard","quantity":1}]}'
TS=$(date +%s)
SIG="sha256=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_INCOMING_SECRET" -hex | sed 's/^.* //')"
curl -X POST http://localhost:3001/webhooks/orders \
  -H "Content-Type: application/json" -H "X-Timestamp: $TS" -H "X-Signature: $SIG" \
  -H "Idempotency-Key: $(uuidgen)" -d "$BODY"
```

## Incoming: `POST /webhooks/orders`

The delivery platform sends one order per request, signed with `WEBHOOK_INCOMING_SECRET`.

| Header | Required | Meaning |
|---|---|---|
| `X-Signature`, `X-Timestamp` | yes | See above |
| `Idempotency-Key` | yes | Same key again returns the first order instead of creating a new one |

Body:

```json
{
  "externalId": "platform-123",
  "customerName": "Bruno",
  "items": [{ "sku": "KB-001", "name": "Mechanical keyboard", "quantity": 1 }],
  "delivery": { "cep": "01001-000", "number": "100", "complement": "apt 3" }
}
```

When `delivery.cep` is present, the street, district, city and state come from [ViaCEP](https://viacep.com.br) (3 s timeout). An unknown CEP or a slow ViaCEP never blocks the order: it is created with the address as sent.

| Answer | When |
|---|---|
| `201` + order | Created |
| `200` + order | Already received (same `Idempotency-Key` or same `externalId`), nothing new created |
| `401 WEBHOOK_SIGNATURE_INVALID` | Signature missing or wrong. Checked before anything else |
| `401 WEBHOOK_TOO_OLD` | Timestamp more than 5 minutes old or in the future |
| `400 INVALID_INPUT` / rule codes | Missing `Idempotency-Key`, bad body, or a domain rule (`ITEMS_INVALID`, `CEP_INVALID`...) |
| `409 IDEMPOTENCY_KEY_REUSED` | The key was already used for a different `externalId` |

Idempotency keys are kept 7 days (a daily job deletes older ones). For a demo, `scripts/delivery-platform.mjs` plays the platform:

```bash
WEBHOOK_INCOMING_SECRET=dev-incoming node scripts/delivery-platform.mjs        # one order every 5 s
WEBHOOK_INCOMING_SECRET=dev-incoming node scripts/delivery-platform.mjs --once
```

## Outgoing: order events

An admin registers a URL on the **Webhooks** page (or `POST /webhook-subscriptions`). The answer shows the subscription's own secret **once**.

Every order event is POSTed to every active subscription:

| Header | Meaning |
|---|---|
| `X-Signature`, `X-Timestamp` | Signed with the subscription's secret |
| `X-Event-Seq` | Event sequence number, increasing across all orders |
| `X-Delivery-Id` | Unique per (event, subscription). Use it to ignore a repeated delivery |

Body (same shape as one item of `GET /events`):

```json
{
  "seq": 42,
  "type": "ORDER_STATUS_CHANGED",
  "orderId": "4f1c…",
  "fromStatus": "READY",
  "toStatus": "DELIVERED",
  "version": 4,
  "actorEmail": "staff@example.com",
  "createdAt": "2026-11-03T12:00:00.000Z",
  "order": { "id": "4f1c…", "number": 7, "customerName": "Ana", "items": [ … ], "status": "DELIVERED", … }
}
```

Event types: `ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_LATE` (an order stayed in `PREPARING` longer than `LATE_AFTER_MINUTES`).

### Delivery and retries

- Deliveries run in a BullMQ queue, so a slow receiver never slows the board. Up to 10 are sent in parallel, so events may arrive out of order. Sort them by `X-Event-Seq`.
- Any answer other than 2xx, or no answer within 10 s, is a failure. The delivery is retried after **1 s, 5 s and 30 s**, then marked `FAILED` with the last error.
- A delivery that stays `PENDING` for 2 minutes (Redis was down, or the API restarted) is queued again by a job that runs every minute.
- Admins see every attempt on the Webhooks page (`GET /webhook-deliveries?status=FAILED`).

To watch deliveries locally:

```bash
WEBHOOK_SECRET=whsec_... node scripts/webhook-receiver.mjs   # listens on :4000, checks each signature
```

Register `http://host.docker.internal:4000` as the URL when the API runs in Docker, or `http://localhost:4000` when it runs on your machine.
