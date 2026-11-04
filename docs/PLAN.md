# Live Orders: plan

A board of orders that updates live for everyone watching it. Kitchen staff move orders through their statuses; the counter screen and the dashboard change at the same moment, without reloading.

## What it shows that Stock Manager does not

- Real-time updates over WebSocket, with reconnection and catch-up after a drop.
- Events published once and delivered to every server instance (Redis pub/sub), so the app can run more than one copy.
- A background job queue (BullMQ) for work that must not block a request: an order that sits too long in one status raises an alert.
- Optimistic concurrency: two people moving the same order at once cannot both win.
- An incoming webhook with HMAC signature check and idempotency keys, an outgoing webhook delivered through the queue with retries, and a third-party API called with a timeout and a fallback.

## Scope of the first version

1. **Orders:** create an order (customer name, items), list today's orders.
2. **Status flow:** `RECEIVED → PREPARING → READY → DELIVERED`, or `CANCELLED` before `READY`. The rule lives in the domain; any other move is refused with a stable error code.
3. **Live board:** a Next.js page with one column per status. Every change appears on every open board within a second.
4. **Catch-up:** each event has a sequence number. A client that reconnects asks for the events it missed instead of reloading everything.
5. **Late alert:** a delayed job flags an order that stays in `PREPARING` longer than a set time; the board shows it in red, with text.
6. **Login with two roles:** `STAFF` moves orders, `VIEWER` only watches.
7. **Orders from a delivery platform (incoming webhook):** `POST /webhooks/orders` accepts orders from an outside platform. The body is signed with HMAC-SHA256 and a shared secret; a wrong or missing signature is refused, and a request older than 5 minutes is refused (replay). Each request carries an idempotency key, so the same order sent twice creates one order. A small script plays the platform for the demo.
8. **Status notifications (outgoing webhook):** an admin registers a URL; every status change is sent there, signed the same way. Delivery runs in the job queue with retries and growing delays (1 s, 5 s, 30 s, then gives up and records the failure), so a slow receiver never slows the board.
9. **Address from the postal code (third-party API):** for delivery orders, the address is filled in from the Brazilian CEP using ViaCEP (free, no key). The call has a 3-second timeout; if ViaCEP fails, the order is still created and the address stays as typed.

Left out of the first version: payments, menus with prices, printing, mobile app.

## Stack

| Part | Choice | Why |
|---|---|---|
| API | NestJS 10, one service | One service is enough here; the point of this project is events, not service boundaries |
| Real time | `@nestjs/websockets` with `ws` | Plain WebSocket, no socket.io protocol to explain |
| Fan-out | Redis pub/sub | Every API instance gets every event |
| Jobs | BullMQ on the same Redis | Delayed jobs for the late alert |
| Database | PostgreSQL + Prisma | Same as Stock Manager |
| Webhooks | HMAC-SHA256 with `crypto.timingSafeEqual`, idempotency keys stored with a unique index | Standard way platforms like Stripe sign webhooks |
| Third-party API | ViaCEP over `fetch` with `AbortSignal.timeout` | Free, no account, real data |
| Web | Next.js 15 (App Router) | Server components for the first load, one client component for the live board |
| Tests | Jest (domain + integration with Postgres and Redis), Playwright (two browsers see the same change) | |
| Run | `docker compose up`: web, api, postgres, redis | |

## Order of work

1. Domain: `Order` entity and status rules, with unit tests.
2. Persistence: Prisma schema, repository, version column for optimistic concurrency, integration test.
3. Events: an `events` table with a sequence number, written in the same transaction as the change; publish to Redis after commit.
4. WebSocket gateway: auth on connect, broadcast, catch-up by sequence number.
5. Late alert job with BullMQ, and a test with a short delay.
6. Web board with live updates and reconnect.
7. Incoming webhook (signature, replay window, idempotency) with tests for each refusal.
8. Outgoing webhook through the queue, with a test receiver that fails twice and then accepts.
9. ViaCEP lookup behind a port, tested with a fake; one integration test against the real API, skipped without network.
10. Playwright test: two browser contexts, one moves an order, the other sees it.
11. Docker compose, CI, README with screenshots, deploy, portfolio entry.
