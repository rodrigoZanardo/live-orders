# api

NestJS service: orders, events, realtime, jobs and webhooks. Root rules in [../AGENTS.md](../AGENTS.md) apply too.

## Layers

- `src/domain`: entities and rules (`Order`, status flow, error catalog). No NestJS, Prisma or I/O.
- `src/application`: use cases and ports (abstract classes). Depends only on `domain`.
- `src/infra`: Prisma repositories, Redis publisher/subscriber, BullMQ queues, ViaCEP client, HMAC.
- `src/http`: controllers and DTOs (class-validator + Swagger).
- `src/realtime`: WebSocket gateway.

## Rules

- Every error is an `AppError` with a code from the catalog in `src/domain/errors.ts`; never throw a bare `Error` or a Nest HTTP exception for a business rule. A new code needs a web translation in EN and PT.
- Every change to an order writes the `Order` row and its `Event` row in one transaction, conditional on `version` (`updateMany where id and version`). Zero rows updated means `ORDER_CHANGED`.
- Every event goes through the `Event` table first; publish to Redis only after the transaction commits.
- Swagger: every route has `@ApiOperation`, its success `@ApiResponse` and each error response.
- Tests: domain rules with unit tests (in-memory fakes, no database); anything that writes gets an integration test against real Postgres/Redis, skipped without `DATABASE_URL` / `REDIS_URL`.

## Commands

- `npm test -w @live/api`, `npm run typecheck -w @live/api`, `npm run build -w @live/api`.
