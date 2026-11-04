import type { EventWithOrder } from './order.use-cases';

/**
 * Port: fans committed events out to every API instance, which push them to their sockets.
 * Called only after the transaction commits. Delivery is best effort: a client that misses a
 * message catches up through GET /events.
 */
export abstract class LiveEvents {
  abstract publish(event: EventWithOrder): Promise<void>;
}
