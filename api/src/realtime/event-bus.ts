import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { LiveEvents } from '../application/live-events';
import type { EventWithOrder } from '../application/order.use-cases';
import { toEventWithOrderResponse } from '../http/order.dto';

export const ORDERS_CHANNEL = 'orders';

type Listener = (message: string) => void;

/** The message every socket receives for an event (PLAN.md section 5, Realtime). */
export function eventMessage(event: EventWithOrder): string {
  return JSON.stringify({ type: 'event', seq: event.seq, event: toEventWithOrderResponse(event) });
}

/** Carries ready-to-send socket messages between API instances. */
export abstract class EventBus extends LiveEvents {
  /** Registers a listener for messages published by any instance, this one included. */
  abstract onMessage(listener: Listener): void;
}

/** Redis pub/sub: every instance subscribes to the same channel, so every instance gets every event. */
@Injectable()
export class RedisEventBus extends EventBus implements OnModuleDestroy {
  private readonly logger = new Logger(RedisEventBus.name);
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly listeners: Listener[] = [];

  constructor(url: string) {
    super();
    // keeps retrying in the background, so the API still starts and serves HTTP while Redis is down
    const options = { maxRetriesPerRequest: 1, enableOfflineQueue: false };
    this.publisher = new Redis(url, options);
    this.subscriber = new Redis(url, { ...options, enableOfflineQueue: true });
    for (const connection of [this.publisher, this.subscriber]) {
      connection.on('error', (error: Error) => this.logger.warn(`Redis: ${error.message}`));
    }
    void this.subscriber.subscribe(ORDERS_CHANNEL).catch((error: Error) => {
      this.logger.warn(`Redis subscribe failed: ${error.message}`);
    });
    this.subscriber.on('message', (channel: string, message: string) => {
      if (channel === ORDERS_CHANNEL) {
        this.listeners.forEach((listener) => listener(message));
      }
    });
  }

  async publish(event: EventWithOrder): Promise<void> {
    try {
      await this.publisher.publish(ORDERS_CHANNEL, eventMessage(event));
    } catch (error) {
      // the event is already committed; clients get it on their next catch-up
      this.logger.warn(`Publish of event ${event.seq} failed: ${String(error)}`);
    }
  }

  onMessage(listener: Listener): void {
    this.listeners.push(listener);
  }

  async onModuleDestroy(): Promise<void> {
    this.publisher.disconnect();
    this.subscriber.disconnect();
  }
}

/** Single-process bus for tests: what is published is delivered to this instance only. */
export class InProcessEventBus extends EventBus {
  private readonly listeners: Listener[] = [];

  async publish(event: EventWithOrder): Promise<void> {
    const message = eventMessage(event);
    this.listeners.forEach((listener) => listener(message));
  }

  onMessage(listener: Listener): void {
    this.listeners.push(listener);
  }
}
