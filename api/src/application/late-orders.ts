import { Injectable } from '@nestjs/common';
import { LiveEvents } from './live-events';
import { OrderRepository } from './order-repository';

/** Port: starts the late timer for an order that just entered PREPARING at `version`. */
export abstract class LateOrderTimer {
  abstract start(orderId: string, version: number): Promise<void>;
}

/** Runs when a late timer fires: flags the order if it is still PREPARING at the same version. */
@Injectable()
export class MarkLateUseCase {
  constructor(
    private readonly orders: OrderRepository,
    private readonly live: LiveEvents,
  ) {}

  /** Returns true when the order was flagged. */
  async execute(orderId: string, version: number, now = new Date()): Promise<boolean> {
    const order = await this.orders.findById(orderId);
    if (!order || !order.markLate(version, now)) {
      return false;
    }
    const event = await this.orders.saveLate(order);
    if (!event) {
      return false;
    }
    await this.live.publish({ ...event, order });
    return true;
  }
}
