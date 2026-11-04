---
name: realtime-event
description: Add a new event type end to end in Live Orders (domain, Event row, Redis, WebSocket, board, outgoing webhook, docs). Use whenever an order change must reach open boards or webhook subscribers.
---

# New realtime event type

Every step is required; an event that skips one breaks catch-up or webhooks.

1. **Domain.** Add the type to the event types in `api/src/domain` with a unit test for when it happens.
2. **Event row in the same transaction.** The repository writes the `Order` change and the `Event` row (`type`, `orderId`, `payload`, `actorEmail`) in one Prisma transaction. Integration test: the event exists only if the change committed.
3. **Publish after commit.** The use case publishes to the Redis channel `orders` after the transaction returns, never inside it.
4. **Gateway.** `src/realtime` forwards it as `{ type: 'event', seq, event }`; the shape matches `GET /events`.
5. **Board reducer.** `web/lib`: handle the type in the pure reducer (apply in `seq` order, ignore duplicates) with a Jest test; texts in EN and PT.
6. **Outgoing webhook.** Check the delivery job sends it with the same payload; update its test if the payload changed.
7. **Docs.** Describe the type and its payload in `docs/WEBHOOKS.md`.
8. Run the [review checklist](../review-checklist/SKILL.md).
