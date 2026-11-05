import type { Order, OrderChannel } from '../domain/order';
import type { OrderStatus } from '../domain/order-status';

export const EVENT_TYPES = ['ORDER_CREATED', 'ORDER_STATUS_CHANGED', 'ORDER_LATE'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** One row of the event log. `seq` orders every event of every order. */
export type OrderEvent = {
  seq: number;
  type: EventType;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  version: number;
  actorEmail: string;
  createdAt: Date;
};

/** Thrown by `create` when the idempotency key or (channel, externalId) already exists. */
export class DuplicateOrderError extends Error {
  constructor() {
    super('Order already exists');
  }
}

/** Port: the application depends on this, infra implements it. Every write also stores its event atomically. */
export abstract class OrderRepository {
  /**
   * Takes the next number of `day`, builds the order with it and saves order + ORDER_CREATED event
   * in one transaction. If `build` throws, nothing is saved and the number is not used.
   * With `idempotencyKey`, the key is stored in the same transaction; a repeated key or external id
   * throws DuplicateOrderError.
   */
  abstract create(
    day: string,
    build: (number: number) => Order,
    actorEmail: string,
    idempotencyKey?: string,
  ): Promise<{ order: Order; event: OrderEvent }>;

  abstract findByIdempotencyKey(key: string): Promise<Order | null>;

  abstract findByExternalId(channel: OrderChannel, externalId: string): Promise<Order | null>;

  /** Deletes idempotency keys created before `before`; returns how many. */
  abstract deleteIdempotencyKeysBefore(before: Date): Promise<number>;

  /**
   * Saves a status move made on `order`, only if the stored version is still `order.version - 1`.
   * Throws ORDER_CHANGED when someone else saved first.
   */
  abstract saveMove(order: Order, actorEmail: string): Promise<OrderEvent>;

  /**
   * Saves the late flag set by `order.markLate`, only while the stored order is still PREPARING at
   * the same version and not yet late, and writes ORDER_LATE. Returns null when it moved on first.
   */
  abstract saveLate(order: Order): Promise<OrderEvent | null>;

  abstract findById(id: string): Promise<Order | null>;

  abstract findByIds(ids: string[]): Promise<Order[]>;

  /** Orders of a business day, by number. */
  abstract findByDay(day: string): Promise<Order[]>;

  /** Orders a CUSTOMER account placed, newest first. */
  abstract findByCustomer(customerId: string): Promise<Order[]>;

  /** Events with `seq` greater than `after`, oldest first, at most `limit`. */
  abstract findEventsAfter(after: number, limit: number): Promise<OrderEvent[]>;

  /** The highest event seq, or 0 when there are no events. */
  abstract lastSeq(): Promise<number>;

  /** Every event of one order, oldest first. */
  abstract findEventsOf(orderId: string): Promise<OrderEvent[]>;
}
