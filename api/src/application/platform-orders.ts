import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { businessDay } from '../domain/business-day';
import { Order, type DeliveryAddress, type OrderItem } from '../domain/order';
import { verifyWebhook } from '../domain/webhook-signature';
import { businessTimeZone } from '../env';
import { AddressLookup } from './address-lookup';
import { LiveEvents } from './live-events';
import { DuplicateOrderError, OrderRepository } from './order-repository';

export const PLATFORM_ACTOR = 'delivery-platform';

export type PlatformOrderBody = {
  externalId: string;
  customerName: string;
  items: OrderItem[];
  delivery?: { cep: string; number: string; complement?: string };
};

export type SignedRequest = {
  rawBody: Buffer;
  signature: string | undefined;
  timestamp: string | undefined;
  idempotencyKey: string;
};

/** Incoming webhook from the delivery platform: signed, replay-protected and idempotent. */
@Injectable()
export class ReceivePlatformOrderUseCase {
  constructor(
    private readonly orders: OrderRepository,
    private readonly live: LiveEvents,
    private readonly addresses: AddressLookup,
  ) {}

  /** `created: false` means the same order was already received; it is returned unchanged. */
  async execute(
    secret: string,
    request: SignedRequest,
    body: PlatformOrderBody,
    now = new Date(),
  ): Promise<{ order: Order; created: boolean }> {
    verifyWebhook({ secret, ...request, body: request.rawBody, now });

    const existing = await this.findExisting(request.idempotencyKey, body.externalId);
    if (existing) {
      return { order: existing, created: false };
    }

    const delivery = body.delivery ? await this.completeAddress(body.delivery) : null;
    const build = (number: number) =>
      Order.create({
        id: randomUUID(),
        number,
        customerName: body.customerName,
        channel: 'DELIVERY_PLATFORM',
        externalId: body.externalId,
        items: body.items,
        delivery,
        now,
      });

    try {
      const day = businessDay(now, businessTimeZone());
      const { order, event } = await this.orders.create(
        day,
        build,
        PLATFORM_ACTOR,
        request.idempotencyKey,
      );
      await this.live.publish({ ...event, order });
      return { order, created: true };
    } catch (error) {
      // a parallel copy of the same request won the race: answer with its order
      const winner =
        error instanceof DuplicateOrderError
          ? await this.findExisting(request.idempotencyKey, body.externalId)
          : null;
      if (winner) {
        return { order: winner, created: false };
      }
      throw error;
    }
  }

  private async findExisting(key: string, externalId: string): Promise<Order | null> {
    return (
      (await this.orders.findByIdempotencyKey(key)) ??
      (await this.orders.findByExternalId('DELIVERY_PLATFORM', externalId.trim()))
    );
  }

  /** ViaCEP fills street, district, city and state; when it fails the order keeps what was sent. */
  private async completeAddress(input: {
    cep: string;
    number: string;
    complement?: string;
  }): Promise<DeliveryAddress> {
    const result = await this.addresses.lookup(input.cep);
    const found = result.found ? result.address : { street: '', district: '', city: '', state: '' };
    const complement = input.complement?.trim();
    return {
      cep: input.cep,
      number: complement ? `${input.number} - ${complement}` : input.number,
      ...found,
    };
  }
}

/** Daily job: idempotency keys only need to live as long as a platform may retry. */
@Injectable()
export class CleanupIdempotencyKeysUseCase {
  static readonly KEEP_DAYS = 7;

  constructor(private readonly orders: OrderRepository) {}

  execute(now = new Date()): Promise<number> {
    const keepFrom = new Date(now.getTime() - CleanupIdempotencyKeysUseCase.KEEP_DAYS * 86_400_000);
    return this.orders.deleteIdempotencyKeysBefore(keepFrom);
  }
}
