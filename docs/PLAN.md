# Live Orders: complete plan

A board of orders that updates live for everyone watching it. Orders arrive from the counter or from a delivery platform (webhook), kitchen staff move them through their statuses, and every open screen changes at the same moment, without reloading. Status changes are pushed to other systems by webhook; the last phase connects it to Stock Manager, which takes the delivered items out of stock.

Read [HANDOFF.md](HANDOFF.md) first: it carries the owner's preferences and the problems already solved in Stock Manager.

---

## 1. What this project shows

| Skill | Where it appears |
|---|---|
| Real time | WebSocket board, reconnection, catch-up of missed events by sequence number |
| Events across instances | Redis pub/sub, so two API copies stay in sync |
| Background jobs | BullMQ: late-order alert, outgoing webhook delivery with retries |
| Concurrency | Optimistic locking with a `version` column; two people cannot both move the same order |
| Integration | Incoming webhook (HMAC, replay window, idempotency), outgoing webhook, third-party API (ViaCEP) with timeout and fallback |
| System integration | Delivered orders take items out of Stock Manager's stock |
| Quality | Domain unit tests, integration tests with Postgres and Redis, Playwright with two browsers, CI |

Left out on purpose: payments, menus with prices, printing, mobile app.

---

## 2. Repository layout

```
live-orders/
  AGENTS.md                 rules for every change (root)
  CLAUDE.md                 @AGENTS.md
  README.md
  .env.example
  docker-compose.yml        web, api, postgres, redis
  render.yaml               Render Blueprint
  .github/workflows/ci.yml
  .agents/skills/           step-by-step skills (see section 11)
  docs/
    PLAN.md  HANDOFF.md  DEPLOY.md  WEBHOOKS.md
    board.png  order.png    screenshots for the README
  scripts/
    delivery-platform.mjs   plays the delivery platform: signs and sends orders to the incoming webhook
    webhook-receiver.mjs    prints the outgoing webhooks it receives (for local testing)
  api/                      NestJS service (AGENTS.md inside)
    prisma/schema.prisma  prisma/migrations/
    src/
      domain/               order.ts, order-status.ts, errors.ts
      application/          use cases + ports
      infra/                prisma repositories, redis publisher/subscriber, bullmq queues, viacep client, hmac
      http/                 controllers + DTOs
      realtime/             websocket gateway
      main.ts  app.module.ts
    test/
  web/                      Next.js app (AGENTS.md inside)
    app/  components/  lib/  messages/en.json  messages/pt.json  e2e/
```

One API service is enough: the point of this project is events and integration, not service boundaries (Stock Manager already shows those).

---

## 3. Domain

### Order

| Field | Rule |
|---|---|
| `id` | UUID |
| `number` | short daily number shown on screens (1, 2, 3...), unique per day |
| `customerName` | 1 to 80 characters |
| `channel` | `COUNTER` or `DELIVERY_PLATFORM` |
| `items` | 1 to 30 items; each `{ sku, name, quantity }`, quantity a whole number from 1 to 99 |
| `delivery` | optional `{ cep, street, number, district, city, state }`; required when `channel` is `DELIVERY_PLATFORM` and `type` is delivery |
| `status` | see below |
| `version` | increases on every change; used for optimistic locking |
| `statusChangedAt` | used by the late alert |
| `externalId` | id from the delivery platform, unique with `channel`; required for `DELIVERY_PLATFORM` (`EXTERNAL_ID_REQUIRED`) |

### Status flow

```
RECEIVED → PREPARING → READY → DELIVERED
    └──────────┴─→ CANCELLED (only before READY)
```

- Any other move is refused with `STATUS_MOVE_INVALID` `{ from, to }`.
- A move with an old `version` is refused with `ORDER_CHANGED` (409): someone else moved it first.
- `DELIVERED` and `CANCELLED` are final.

### Error catalog (stable codes, translated in the web app)

`ORDER_NOT_FOUND`, `STATUS_MOVE_INVALID`, `ORDER_CHANGED`, `ITEMS_INVALID`, `CUSTOMER_NAME_INVALID`, `CEP_INVALID`, `EXTERNAL_ID_REQUIRED`, `IDEMPOTENCY_KEY_REUSED`, `WEBHOOK_SIGNATURE_INVALID`, `WEBHOOK_TOO_OLD`, `WEBHOOK_URL_INVALID`, `WEBHOOK_SUBSCRIPTION_NOT_FOUND`, `EMAIL_INVALID`, `PASSWORD_TOO_SHORT`, `EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `TOO_MANY_ATTEMPTS`, `SESSION_INVALID`, `FORBIDDEN`, `INVALID_INPUT`. Same response shape as Stock Manager: `{ statusCode, code, message, params }`, with a test that fails if a code has no translation.

---

## 4. Data (Prisma)

| Table | Columns | Notes |
|---|---|---|
| `User` | id, email (unique), passwordHash, role (`STAFF`, `VIEWER`, `ADMIN`), failedLogins, lockedUntil, createdAt | scrypt hash; first admin from env on first start |
| `Order` | fields above + `day` (business day in `BUSINESS_TIME_ZONE`) + delivery columns + createdAt | index on (createdAt), unique (day, number), unique (channel, externalId) |
| `DailyCounter` | day (primary key), last | daily order number, incremented atomically in the create transaction |
| `OrderItem` | id, orderId, sku, name, quantity | |
| `Event` | `seq` (bigserial, primary key), type, orderId, fromStatus, toStatus, version, actorEmail, createdAt | the source of truth for the board and the audit trail; typed columns instead of a json payload, so reads need no unchecked casts. The API joins the current order when it returns events |
| `IdempotencyKey` | key (unique), orderId, createdAt | incoming webhook dedupe; rows older than 7 days deleted by a daily job |
| `WebhookSubscription` | id, url, secret, active, createdAt | outgoing webhooks |
| `WebhookDelivery` | id, subscriptionId, eventSeq, eventType, payload (exact body sent), status (`PENDING`, `SENT`, `FAILED`), attempts, lastError, updatedAt | visible to admins |
| `FailedLogin` handled as in Stock Manager | per-account lockout: 5 failures, 15 minutes | |

Every change to an order writes the `Order` row and its `Event` row in **one transaction**. The update is conditional on `version` (`updateMany where id and version`), so the race is decided by the database.

---

## 5. API (NestJS)

All routes need a JWT (HS256 is enough here, one service; secret from env) except login and the incoming webhook. Swagger at `/docs`, every route with summary, success and error responses (same `ApiErrorResponse` helper as Stock Manager).

| Method | Route | Role | What it does |
|---|---|---|---|
| POST | `/auth/login` | public | Returns a token; per-account lockout |
| POST | `/users` | admin | Create a user |
| GET | `/users` | admin | List users |
| GET | `/orders?date=YYYY-MM-DD` | any | Orders of a day (default today), with status and items |
| GET | `/orders/:id` | any | One order with its events |
| POST | `/orders` | staff, admin | Create a counter order |
| POST | `/orders/:id/status` | staff, admin | Body `{ to, version }`. Moves the status |
| GET | `/events?after=<seq>` | any | Events after a sequence number, at most 500 (catch-up) |
| GET | `/events/last` | any | `{ lastSeq }`; the board reads it before loading orders, so no event falls between the two |
| GET | `/address/:cep` | staff, admin | ViaCEP lookup; `found: false` when unknown or unavailable |
| POST | `/webhooks/orders` | public, signed | Incoming orders from the delivery platform |
| GET/POST/DELETE | `/webhook-subscriptions` | admin | Manage outgoing webhooks |
| GET | `/webhook-deliveries?status=FAILED` | admin | Delivery attempts, newest first |
| GET | `/health` | public | For Render and docker healthchecks |

### Realtime (WebSocket, path `/live`)

- Connect with `?token=<jwt>`; a bad token closes with code 4401.
- Server → client messages: `{ "type": "event", "seq": 42, "event": { ...same shape as GET /events } }` and `{ "type": "hello", "lastSeq": 42 }` on connect.
- Client keeps the last `seq` it applied. On reconnect it calls `GET /events?after=<lastSeq>` and applies those, then listens again. Events are applied in `seq` order and duplicates are ignored, so a missed or repeated message never breaks the board.
- Fan-out: after the transaction commits, the API publishes the event to the Redis channel `orders`. Every API instance subscribes and pushes it to its own sockets.
- Heartbeat: ping every 25 s; the client reconnects with growing delay (1, 2, 5, 10 s) when the connection drops.

### Jobs (BullMQ on Redis)

| Queue | When | What |
|---|---|---|
| `late-orders` | when an order enters `PREPARING`, a delayed job (default 10 min, env `LATE_AFTER_MINUTES`) | If the order is still `PREPARING` with the same version, write an `ORDER_LATE` event (shown in red with text on the board) |
| `webhook-deliveries` | after every order event, one job per active subscription | POST the event, signed; retries at 1 s, 5 s, 30 s, then `FAILED` with the last error |
| `cleanup` | daily | Delete idempotency keys older than 7 days |

---

## 6. Webhooks (documented in `docs/WEBHOOKS.md`)

### Incoming: `POST /webhooks/orders`

- Headers: `X-Signature: sha256=<hex>`, `X-Timestamp: <unix seconds>`, `Idempotency-Key: <string>`.
- Signature: HMAC-SHA256 of `<timestamp>.<raw body>` with `WEBHOOK_INCOMING_SECRET`, compared with `timingSafeEqual`. The raw body must be kept before JSON parsing.
- Refused: missing or wrong signature (401 `WEBHOOK_SIGNATURE_INVALID`), timestamp older than 5 minutes or in the future (401 `WEBHOOK_TOO_OLD`), invalid body (400).
- Same `Idempotency-Key` again: 200 with the order already created, no new order.
- Body: `{ externalId, customerName, items[], delivery?: { cep, number, complement } }`. When `cep` is present, the address is completed with ViaCEP.
- `scripts/delivery-platform.mjs` sends a random order every few seconds for the demo (`--once` sends one).

### Outgoing

- Body: the event (`seq`, `type`, `order`), headers `X-Signature`, `X-Timestamp`, `X-Event-Seq`.
- Same signing scheme, with each subscription's own secret (shown once, when created).
- `scripts/webhook-receiver.mjs` verifies the signature and prints what it receives.

### Third-party API: ViaCEP

- `GET https://viacep.com.br/ws/{cep}/json/` behind a port `AddressLookup`, with `AbortSignal.timeout(3000)`.
- `{ "erro": true }` means "not found". Timeout or 5xx means "unavailable": the order is still created with the address as sent.
- Unit tests use a fake; one integration test calls the real API and is skipped without network.

---

## 7. Web (Next.js 15, App Router)

Same base as Stock Manager: Tailwind, next-intl (EN/PT with flag buttons), Auto/Light/Dark theme, react-hook-form + zod, all API calls in `lib/api.ts`, JWT in an httpOnly cookie, translated error codes. No `loading.tsx` (see HANDOFF); pending state in the nav.

| Page | What it has |
|---|---|
| `/login` | Login form |
| `/` (Board) | Four columns (Received, Preparing, Ready, Delivered) plus a collapsed Cancelled list. Each card: number, customer, items, time in the current status, channel badge, late badge in red with the word "Late". Staff move a card with buttons ("Start", "Ready", "Delivered", "Cancel"); keyboard accessible, no drag-only actions. A connection badge: Live / Reconnecting / Offline |
| `/orders/new` | Counter order form: customer, items (add/remove rows), optional delivery with CEP lookup that fills the address |
| `/orders/[id]` | Order detail with its event timeline (who, what, when) |
| `/webhooks` | Admin: subscriptions (add, remove, show secret once), recent deliveries with status and last error |
| `/users` | Admin: list and create users |

The board is the only big client component: it receives the first list from the server, opens the WebSocket, applies events by `seq`, and calls the catch-up route on reconnect. A sound and a title badge ("(2) Live Orders") when a new order arrives, both easy to mute.

---

## 8. Tests

| Level | What | Tool |
|---|---|---|
| Unit | Every status move (allowed and refused), item and name rules, daily number, HMAC signing and checking, replay window, event ordering and dedupe on the client (pure function) | Jest (in api, and for the pure board reducer in web) |
| Integration | Two moves with the same version: one wins, one gets `ORDER_CHANGED`; event written in the same transaction; idempotency key under two parallel requests; Redis fan-out between two subscriber instances; late-order job with a 1 s delay; outgoing webhook to a test receiver that fails twice then accepts | Jest + real Postgres and Redis (skipped without `DATABASE_URL` / `REDIS_URL`, run in CI) |
| End to end | Two browser contexts: one moves an order, the other sees it within 2 s; incoming webhook order appears on the board; Portuguese switch | Playwright against docker compose |

A bug fix starts with a test that reproduces it.

---

## 9. CI (GitHub Actions)

- `api`: install, build, typecheck, unit tests; then Postgres and Redis service containers, migrate, integration tests.
- `web`: install, lint, build, unit tests of the board reducer.
- `e2e`: `docker compose up -d --build`, wait for `/health`, Playwright.

---

## 10. Run and deploy

- Local: `npm start` at the root runs `docker compose up --build -d` and prints the URL and the demo login; `npm run stop`.
- `.env.example` documents every variable: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `WEBHOOK_INCOMING_SECRET`, `LATE_AFTER_MINUTES`, `WEB_ORIGIN`, `API_URL`, `STOCK_MANAGER_WEBHOOK_URL` (phase 7).
- Render (free plan): `render.yaml` with `api` and `web` web services, one Postgres, one Key Value (Redis-compatible). Check the current free limits of Key Value first. Set secrets through the Render API as described in HANDOFF; `HOSTNAME=0.0.0.0` in the web image.
- A demo account (`demo@example.com`, STAFF) shown in the README and the portfolio; the real admin password stays private.
- Demo data: the delivery-platform script can run as a Render cron job every few minutes so the board is never empty (only if the free plan allows; otherwise a "Send sample order" button for admins).

---

## 11. Agent setup (so later sessions keep the same quality)

- Root `AGENTS.md`: rules for every change (already there), plus Layout and Commands sections filled in as folders appear.
- `api/AGENTS.md`: layers (domain, application, infra, http, realtime), error catalog rule, transaction + version rule, every event goes through the `Event` table first, Swagger rule, testing rule.
- `web/AGENTS.md`: server components fetch, the board is the one live client component, API calls only in `lib/api.ts`, translations, accessibility (no color-only signals, keyboard moves), no `loading.tsx`.
- `.agents/skills/`:
  - `backend-feature/SKILL.md`: new endpoint, use case or entity, step by step (domain test first, use case, repository, controller with Swagger, error codes + translations, integration test if it writes).
  - `frontend-feature/SKILL.md`: new page or component (server data, client only when needed, translations EN/PT, loading/error/empty states, Playwright when it changes a flow).
  - `realtime-event/SKILL.md`: adding a new event type end to end (domain, Event row in the same transaction, Redis publish after commit, gateway message, board reducer, outgoing webhook payload, docs/WEBHOOKS.md).
  - `review-checklist/SKILL.md`: before calling a change done (tests, typecheck, lint, build, translations, Swagger, `.env.example`, no secrets, Conventional Commit scope).
- `CLAUDE.md` in each folder contains `@AGENTS.md`.

---

## 12. README outline

1. Title, CI badge, stack badges, one-sentence pitch.
2. **Live demo** link with the demo login, and a GIF of two windows updating together.
3. Run it in one command (`npm start`), URLs table (web, API docs).
4. Quick tour: create an order, move it on one window and watch the other; send a webhook order with the script; see the late alert; switch to Portuguese.
5. Architecture diagram (mermaid): web ↔ api (HTTP + WebSocket), api ↔ Postgres, api ↔ Redis (pub/sub + queues), delivery platform → incoming webhook, api → outgoing webhooks → Stock Manager, api → ViaCEP.
6. How real time works: transaction + `Event` row, publish after commit, fan-out, catch-up by `seq`.
7. Webhooks: link to docs/WEBHOOKS.md, signing example with curl.
8. Technical decisions table (why one service, why `ws`, why Redis, why the Event table, why optimistic locking).
9. Tests and CI.
10. Next improvements.

English only (see root AGENTS.md).

---

## 13. Order of work and commits

Each step ends with its checks green and a commit (or two: structure, then behaviour).

| # | Step | Done when |
|---|---|---|
| 1 | Scaffold: npm workspaces (`api`, `web`), TypeScript strict, ESLint, Prettier, Jest; `api/AGENTS.md`, `web/AGENTS.md`, skills | `npm test` and `npm run typecheck` run (empty) |
| 2 | Domain: `Order`, status flow, item rules, error catalog | Unit tests for every move |
| 3 | Persistence: Prisma schema, migrations, repositories, version check, `Event` in the same transaction | Integration test: concurrent moves, one wins |
| 4 | Auth: users, login, lockout, roles, guard | Tests as in Stock Manager |
| 5 | Orders API + Swagger: create, list, move, events after seq | Swagger complete, tests green |
| 6 | Realtime: WebSocket gateway, Redis publish/subscribe, catch-up | Integration test with two subscribers |
| 7 | Jobs: late-order alert | Test with a 1 s delay |
| 8 | Incoming webhook: signature, replay, idempotency, ViaCEP | A test for each refusal; ViaCEP fake + real (skippable) |
| 9 | Outgoing webhooks: subscriptions, delivery queue, retries, deliveries list | Receiver that fails twice then accepts |
| 10 | Web: login, board with live updates and reconnect, order form with CEP, order detail, webhooks and users pages, EN/PT, theme | Lint, build, reducer tests |
| 11 | E2E: two browsers, webhook order on the board | Playwright green locally |
| 12 | Docker compose, `npm start`, CI with Postgres + Redis + e2e | CI green on GitHub |
| 13 | README, docs/WEBHOOKS.md, docs/DEPLOY.md, screenshots and GIF | Reads well from top to bottom |
| 14 | Deploy on Render, demo account, smoke test on the public URL | Login and a live move work on the demo |
| 15 | Portfolio card (EN/PT) and LinkedIn text for the owner to paste | Portfolio shows the project with demo login |
| 16 | **Integration with Stock Manager** (below) | A delivered order lowers stock in Stock Manager |

---

## 14. Phase 16: integration with Stock Manager

Goal: two independent systems talking by events. Neither needs the other to work alone.

- **Live Orders side:** nothing new to build. Stock Manager is registered as an outgoing webhook subscription; only `ORDER_DELIVERED` events matter to it.
- **Stock Manager side** (changes in `D:\particular\stock-manager`, following its own AGENTS.md and skills):
  - New endpoint in the stock service: `POST /webhooks/live-orders`, public but signed with the same HMAC scheme, secret in `LIVE_ORDERS_WEBHOOK_SECRET`.
  - For each item, register a stock `OUT` movement by SKU, in one transaction, with the note "Order #<number> (Live Orders)" and the actor `live-orders@integration`.
  - Idempotent by `X-Event-Seq`: the same event twice changes stock once (unique key table).
  - Unknown SKU or not enough stock: refuse with the existing codes (`PRODUCT_NOT_FOUND`, `NOT_ENOUGH_STOCK`); Live Orders records the failed delivery, visible on its Webhooks page.
  - Tests: signature, replay, idempotency, partial stock (all or nothing), plus an integration test against Postgres.
  - Gateway route for `/webhooks/live-orders`, `render.yaml` and `.env.example` updated, Swagger documented.
- **Demo:** the SKUs used by the delivery-platform script match products in the Stock Manager demo (`KB-001`, `MS-002`...), so delivering an order there visibly lowers stock in the other app.
- **README of both projects:** a short "Works with" section linking to each other, and the portfolio card mentions the integration.
