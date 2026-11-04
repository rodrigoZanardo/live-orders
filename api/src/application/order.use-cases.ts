import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { businessTimeZone } from '../env';
import { businessDay, isBusinessDay } from '../domain/business-day';
import { AppError } from '../domain/errors';
import { Order, type DeliveryAddress, type OrderItem } from '../domain/order';
import type { OrderStatus } from '../domain/order-status';
import type { Actor } from './auth.ports';
import { LiveEvents } from './live-events';
import { OrderRepository, type OrderEvent } from './order-repository';

/** An event with the current state of its order, as the board and the webhooks receive it. */
export type EventWithOrder = OrderEvent & { order: Order };

export const MAX_EVENTS_PER_PAGE = 500;

export type NewCounterOrder = {
  customerName: string;
  items: OrderItem[];
  delivery?: DeliveryAddress | null;
};

@Injectable()
export class CreateOrderUseCase {
  constructor(
    private readonly orders: OrderRepository,
    private readonly live: LiveEvents,
  ) {}

  async execute(input: NewCounterOrder, actor: Actor, now = new Date()): Promise<EventWithOrder> {
    const day = businessDay(now, businessTimeZone());
    const build = (number: number) =>
      Order.create({ ...input, id: randomUUID(), number, channel: 'COUNTER', now });
    const { order, event } = await this.orders.create(day, build, actor.email);
    // after the commit, never inside the transaction
    const created = { ...event, order };
    await this.live.publish(created);
    return created;
  }
}

@Injectable()
export class ListOrdersUseCase {
  constructor(private readonly orders: OrderRepository) {}

  /** Orders of a business day (YYYY-MM-DD); today when omitted. */
  async execute(day?: string, now = new Date()): Promise<Order[]> {
    if (day !== undefined && !isBusinessDay(day)) {
      throw new AppError('INVALID_INPUT', { details: 'date must be a real day as YYYY-MM-DD' });
    }
    return this.orders.findByDay(day ?? businessDay(now, businessTimeZone()));
  }
}

@Injectable()
export class GetOrderUseCase {
  constructor(private readonly orders: OrderRepository) {}

  async execute(id: string): Promise<{ order: Order; events: OrderEvent[] }> {
    const order = await this.orders.findById(id);
    if (!order) {
      throw new AppError('ORDER_NOT_FOUND');
    }
    return { order, events: await this.orders.findEventsOf(id) };
  }
}

@Injectable()
export class MoveOrderUseCase {
  constructor(
    private readonly orders: OrderRepository,
    private readonly live: LiveEvents,
  ) {}

  async execute(
    input: { id: string; to: OrderStatus; version: number },
    actor: Actor,
    now = new Date(),
  ): Promise<EventWithOrder> {
    const order = await this.orders.findById(input.id);
    if (!order) {
      throw new AppError('ORDER_NOT_FOUND');
    }
    order.moveTo(input.to, input.version, now);
    const event = await this.orders.saveMove(order, actor.email);
    const moved = { ...event, order };
    await this.live.publish(moved);
    return moved;
  }
}

@Injectable()
export class ListEventsUseCase {
  constructor(private readonly orders: OrderRepository) {}

  /** Catch-up: events after `seq`, oldest first, each with its order's current state. */
  async execute(after: number): Promise<EventWithOrder[]> {
    const events = await this.orders.findEventsAfter(after, MAX_EVENTS_PER_PAGE);
    const orders = await this.orders.findByIds([...new Set(events.map((event) => event.orderId))]);
    const byId = new Map(orders.map((order) => [order.id, order]));
    return events.flatMap((event) => {
      const order = byId.get(event.orderId);
      return order ? [{ ...event, order }] : [];
    });
  }
}
