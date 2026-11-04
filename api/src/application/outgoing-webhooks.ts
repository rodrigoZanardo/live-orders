import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { AppError } from '../domain/errors';
import { validWebhookUrl } from '../domain/webhook-subscription';
import { allowPrivateWebhookTargets } from '../env';
import { LiveEvents } from './live-events';
import type { EventType } from './order-repository';
import type { EventWithOrder } from './order.use-cases';

export const DELIVERY_STATUSES = ['PENDING', 'SENT', 'FAILED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export type Subscription = { id: string; url: string; active: boolean; createdAt: Date };

export type Delivery = {
  id: string;
  subscriptionId: string;
  url: string;
  eventSeq: number;
  eventType: EventType;
  status: DeliveryStatus;
  attempts: number;
  lastError: string | null;
  updatedAt: Date;
};

/** What the worker needs to send one delivery. */
export type DeliveryToSend = {
  id: string;
  url: string;
  secret: string;
  eventSeq: number;
  payload: string;
};

/** Port: subscriptions and their delivery records. */
export abstract class WebhookRepository {
  abstract createSubscription(input: {
    id: string;
    url: string;
    secret: string;
  }): Promise<Subscription>;
  abstract listSubscriptions(): Promise<Subscription[]>;
  /** Returns false when the id does not exist. */
  abstract deleteSubscription(id: string): Promise<boolean>;
  /** One PENDING delivery per active subscription; returns their ids. */
  abstract createDeliveries(event: {
    seq: number;
    type: EventType;
    payload: string;
  }): Promise<string[]>;
  abstract findToSend(deliveryId: string): Promise<DeliveryToSend | null>;
  abstract markSent(deliveryId: string, attempts: number): Promise<void>;
  /** Records a failed attempt; `final` turns the delivery FAILED. */
  abstract markAttemptFailed(
    deliveryId: string,
    attempts: number,
    error: string,
    final: boolean,
  ): Promise<void>;
  /** Ids of PENDING deliveries not updated since `before`. */
  abstract findStalePending(before: Date): Promise<string[]>;
  /** Newest first. */
  abstract listDeliveries(status: DeliveryStatus | undefined, limit: number): Promise<Delivery[]>;
}

/** Port: queues deliveries so slow receivers never slow the request that caused the event. */
export abstract class DeliveryQueue {
  abstract enqueue(deliveryIds: string[]): Promise<void>;
}

/** Port: one signed HTTP POST; throws on a network error or a non-2xx answer. */
export abstract class WebhookSender {
  abstract send(delivery: DeliveryToSend): Promise<void>;
}

/** Body every subscriber receives: the same shape as one item of GET /events. */
export type EventSerializer = (event: EventWithOrder) => string;

@Injectable()
export class CreateSubscriptionUseCase {
  constructor(private readonly webhooks: WebhookRepository) {}

  /** The secret is returned only here; it is never shown again. */
  async execute(url: string): Promise<Subscription & { secret: string }> {
    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    const subscription = await this.webhooks.createSubscription({
      id: randomUUID(),
      url: validWebhookUrl(url, allowPrivateWebhookTargets()),
      secret,
    });
    return { ...subscription, secret };
  }
}

@Injectable()
export class ListSubscriptionsUseCase {
  constructor(private readonly webhooks: WebhookRepository) {}

  execute(): Promise<Subscription[]> {
    return this.webhooks.listSubscriptions();
  }
}

@Injectable()
export class DeleteSubscriptionUseCase {
  constructor(private readonly webhooks: WebhookRepository) {}

  async execute(id: string): Promise<void> {
    if (!(await this.webhooks.deleteSubscription(id))) {
      throw new AppError('WEBHOOK_SUBSCRIPTION_NOT_FOUND');
    }
  }
}

@Injectable()
export class ListDeliveriesUseCase {
  static readonly LIMIT = 100;

  constructor(private readonly webhooks: WebhookRepository) {}

  execute(status?: DeliveryStatus): Promise<Delivery[]> {
    return this.webhooks.listDeliveries(status, ListDeliveriesUseCase.LIMIT);
  }
}

/** Runs in the queue worker for one attempt. Throws when the attempt failed and should be retried. */
@Injectable()
export class DeliverWebhookUseCase {
  constructor(
    private readonly webhooks: WebhookRepository,
    private readonly sender: WebhookSender,
  ) {}

  async execute(deliveryId: string, attempt: number, isLastAttempt: boolean): Promise<void> {
    const delivery = await this.webhooks.findToSend(deliveryId);
    if (!delivery) {
      return; // subscription deleted meanwhile
    }
    try {
      await this.sender.send(delivery);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.webhooks.markAttemptFailed(deliveryId, attempt, message, isLastAttempt);
      throw error;
    }
    await this.webhooks.markSent(deliveryId, attempt);
  }
}

/**
 * Safety net for deliveries whose enqueue failed or whose process died: re-queues PENDING ones
 * idle for over 2 minutes. Job ids are delivery ids, so a delivery whose job still exists is not queued twice.
 */
@Injectable()
export class RequeueStaleDeliveriesUseCase {
  static readonly STALE_MS = 120_000;

  constructor(
    private readonly webhooks: WebhookRepository,
    private readonly queue: DeliveryQueue,
  ) {}

  async execute(now = new Date()): Promise<number> {
    const ids = await this.webhooks.findStalePending(
      new Date(now.getTime() - RequeueStaleDeliveriesUseCase.STALE_MS),
    );
    if (ids.length > 0) {
      await this.queue.enqueue(ids);
    }
    return ids.length;
  }
}

/** Receives every committed event (like the WebSocket fan-out) and queues one delivery per subscription. */
export class WebhookDispatch extends LiveEvents {
  constructor(
    private readonly webhooks: WebhookRepository,
    private readonly queue: DeliveryQueue,
    private readonly serialize: EventSerializer,
  ) {
    super();
  }

  async publish(event: EventWithOrder): Promise<void> {
    const ids = await this.webhooks.createDeliveries({
      seq: event.seq,
      type: event.type,
      payload: this.serialize(event),
    });
    if (ids.length > 0) {
      await this.queue.enqueue(ids);
    }
  }
}

/** Sends each committed event to every target: the live boards and the webhook subscribers. */
export class FanOutLiveEvents extends LiveEvents {
  private readonly logger = new Logger(FanOutLiveEvents.name);

  constructor(private readonly targets: LiveEvents[]) {
    super();
  }

  /** Never throws: the event is already committed, and one failing target must not block the others. */
  async publish(event: EventWithOrder): Promise<void> {
    const results = await Promise.allSettled(this.targets.map((target) => target.publish(event)));
    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn(`Event ${event.seq} not fanned out: ${String(result.reason)}`);
      }
    }
  }
}
