import type { Order } from '../domain/order';
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

/** Port: the application depends on this, infra implements it. Every write also stores its event atomically. */
export abstract class OrderRepository {
  /**
   * Takes the next number of `day`, builds the order with it and saves order + ORDER_CREATED event
   * in one transaction. If `build` throws, nothing is saved and the number is not used.
   */
  abstract create(
    day: string,
    build: (number: number) => Order,
    actorEmail: string,
  ): Promise<{ order: Order; event: OrderEvent }>;

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

  /** Events with `seq` greater than `after`, oldest first, at most `limit`. */
  abstract findEventsAfter(after: number, limit: number): Promise<OrderEvent[]>;

  /** The highest event seq, or 0 when there are no events. */
  abstract lastSeq(): Promise<number>;

  /** Every event of one order, oldest first. */
  abstract findEventsOf(orderId: string): Promise<OrderEvent[]>;
}
