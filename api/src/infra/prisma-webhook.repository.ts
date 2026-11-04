import { Injectable } from '@nestjs/common';
import {
  WebhookRepository,
  type Delivery,
  type DeliveryStatus,
  type DeliveryToSend,
  type Subscription,
} from '../application/outgoing-webhooks';
import type { EventType } from '../application/order-repository';
import { PrismaService } from './prisma.service';

const subscriptionFields = { id: true, url: true, active: true, createdAt: true } as const;

@Injectable()
export class PrismaWebhookRepository extends WebhookRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  createSubscription(input: { id: string; url: string; secret: string }): Promise<Subscription> {
    return this.db.webhookSubscription.create({ data: input, select: subscriptionFields });
  }

  listSubscriptions(): Promise<Subscription[]> {
    return this.db.webhookSubscription.findMany({
      select: subscriptionFields,
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteSubscription(id: string): Promise<boolean> {
    const { count } = await this.db.webhookSubscription.deleteMany({ where: { id } });
    return count > 0;
  }

  async createDeliveries(event: {
    seq: number;
    type: EventType;
    payload: string;
  }): Promise<string[]> {
    const subscriptions = await this.db.webhookSubscription.findMany({
      where: { active: true },
      select: { id: true },
    });
    const rows = await this.db.webhookDelivery.createManyAndReturn({
      data: subscriptions.map((subscription) => ({
        subscriptionId: subscription.id,
        eventSeq: BigInt(event.seq),
        eventType: event.type,
        payload: event.payload,
      })),
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async findToSend(deliveryId: string): Promise<DeliveryToSend | null> {
    const row = await this.db.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { subscription: { select: { url: true, secret: true } } },
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      url: row.subscription.url,
      secret: row.subscription.secret,
      eventSeq: Number(row.eventSeq),
      payload: row.payload,
    };
  }

  async markSent(deliveryId: string, attempts: number): Promise<void> {
    await this.db.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'SENT', attempts, lastError: null },
    });
  }

  async markAttemptFailed(
    deliveryId: string,
    attempts: number,
    error: string,
    final: boolean,
  ): Promise<void> {
    await this.db.webhookDelivery.update({
      where: { id: deliveryId },
      data: { attempts, lastError: error.slice(0, 500), status: final ? 'FAILED' : 'PENDING' },
    });
  }

  async listDeliveries(status: DeliveryStatus | undefined, limit: number): Promise<Delivery[]> {
    const rows = await this.db.webhookDelivery.findMany({
      where: status ? { status } : {},
      include: { subscription: { select: { url: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      subscriptionId: row.subscriptionId,
      url: row.subscription.url,
      eventSeq: Number(row.eventSeq),
      eventType: row.eventType,
      status: row.status,
      attempts: row.attempts,
      lastError: row.lastError,
      updatedAt: row.updatedAt,
    }));
  }
}
