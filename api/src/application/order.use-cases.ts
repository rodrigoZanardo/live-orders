import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { businessTimeZone } from '../env';
import { businessDay, isBusinessDay } from '../domain/business-day';
import { AppError } from '../domain/errors';
import { numberWithComplement, Order, type DeliveryAddress, type OrderItem } from '../domain/order';
import { assertInStock } from '../domain/stock-check';
import type { OrderStatus } from '../domain/order-status';
import { UserRepository, type Actor } from './auth.ports';
import { LateOrderTimer } from './late-orders';
import { LiveEvents } from './live-events';
import { OrderRepository, type OrderEvent } from './order-repository';
import { StockAvailability } from './stock-availability';

/** An event with the current state of its order, as the board and the webhooks receive it. */
export type EventWithOrder = OrderEvent & { order: Order };

export const MAX_EVENTS_PER_PAGE = 500;

export type NewCounterOrder = {
  customerName: string;
  items: OrderItem[];
  delivery?: DeliveryAddress | null;
  customerId?: string | null;
};

@Injectable()
export class CreateOrderUseCase {
  constructor(
    private readonly orders: OrderRepository,
    private readonly live: LiveEvents,
    private readonly stock: StockAvailability,
  ) {}

  async execute(input: NewCounterOrder, actor: Actor, now = new Date()): Promise<EventWithOrder> {
    await this.checkStock(input.items);
    const day = businessDay(now, businessTimeZone());
    const build = (number: number) =>
      Order.create({ ...input, id: randomUUID(), number, channel: 'COUNTER', now });
    const { order, event } = await this.orders.create(day, build, actor.email);
    // after the commit, never inside the transaction
    const created = { ...event, order };
    await this.live.publish(created);
    return created;
  }

  /** Counter orders only; platform orders are already paid and are not checked here. */
  private async checkStock(items: OrderItem[]): Promise<void> {
    const skus = [...new Set(items.map((item) => item.sku))];
    assertInStock(items, await this.stock.available(skus));
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
    private readonly lateTimer: LateOrderTimer,
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
    if (order.status === 'PREPARING') {
      await this.lateTimer.start(order.id, order.version);
    }
    return moved;
  }
}

@Injectable()
export class ListEventsUseCase {
  constructor(private readonly orders: OrderRepository) {}

  /** The newest seq; a board reads it before loading orders, so no event falls between the two. */
  lastSeq(): Promise<number> {
    return this.orders.lastSeq();
  }

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

/** A CUSTOMER orders for delivery: name and address come from the account, never from the request. */
@Injectable()
export class PlaceCustomerOrderUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly createOrder: CreateOrderUseCase,
  ) {}

  async execute(items: OrderItem[], actor: Actor, now = new Date()): Promise<EventWithOrder> {
    const profile = (await this.users.findById(actor.id))?.profile;
    if (!profile) {
      throw new AppError('FORBIDDEN');
    }
    const { complement, ...address } = profile.address;
    return this.createOrder.execute(
      {
        customerName: profile.name,
        items,
        delivery: { ...address, number: numberWithComplement(address.number, complement) },
        customerId: actor.id,
      },
      actor,
      now,
    );
  }
}

@Injectable()
export class ListMyOrdersUseCase {
  constructor(private readonly orders: OrderRepository) {}

  execute(actor: Actor): Promise<Order[]> {
    return this.orders.findByCustomer(actor.id);
  }
}

/** A customer cancels their own order while it is RECEIVED; through the same move as staff, so stock is released. */
@Injectable()
export class CancelMyOrderUseCase {
  constructor(
    private readonly orders: OrderRepository,
    private readonly moveOrder: MoveOrderUseCase,
  ) {}

  async execute(
    input: { id: string; version: number },
    actor: Actor,
    now = new Date(),
  ): Promise<EventWithOrder> {
    const order = await this.orders.findById(input.id);
    // someone else's order answers like a missing one, so ids of other customers reveal nothing
    if (!order || order.customerId !== actor.id) {
      throw new AppError('ORDER_NOT_FOUND');
    }
    if (!order.canBeCancelledBy(actor.id)) {
      throw new AppError('STATUS_MOVE_INVALID', { from: order.status, to: 'CANCELLED' });
    }
    if (input.version !== order.version) {
      throw new AppError('ORDER_CHANGED');
    }
    // the version checked here: if staff moved it meanwhile, the move fails with ORDER_CHANGED
    return this.moveOrder.execute(
      { id: order.id, to: 'CANCELLED', version: order.version },
      actor,
      now,
    );
  }
}
