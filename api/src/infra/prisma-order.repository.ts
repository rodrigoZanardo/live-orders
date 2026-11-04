import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Event,
  type Order as OrderRow,
  type OrderItem as OrderItemRow,
} from '@prisma/client';
import {
  DuplicateOrderError,
  OrderRepository,
  type OrderEvent,
} from '../application/order-repository';
import { AppError } from '../domain/errors';
import { Order, type OrderChannel } from '../domain/order';
import { PrismaService } from './prisma.service';

type OrderWithItems = OrderRow & { items: OrderItemRow[] };

/** Who appears in the timeline for events the server raises by itself. */
export const SYSTEM_ACTOR = 'system';

const withItems = { items: { orderBy: { position: 'asc' } } } satisfies Prisma.OrderInclude;

@Injectable()
export class PrismaOrderRepository extends OrderRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  async create(
    day: string,
    build: (number: number) => Order,
    actorEmail: string,
    idempotencyKey?: string,
  ): Promise<{ order: Order; event: OrderEvent }> {
    try {
      return await this.insert(day, build, actorEmail, idempotencyKey);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DuplicateOrderError();
      }
      throw error;
    }
  }

  async findByIdempotencyKey(key: string): Promise<Order | null> {
    const row = await this.db.idempotencyKey.findUnique({
      where: { key },
      include: { order: { include: withItems } },
    });
    return row ? toOrder(row.order) : null;
  }

  async findByExternalId(channel: OrderChannel, externalId: string): Promise<Order | null> {
    const row = await this.db.order.findUnique({
      where: { channel_externalId: { channel, externalId } },
      include: withItems,
    });
    return row ? toOrder(row) : null;
  }

  async deleteIdempotencyKeysBefore(before: Date): Promise<number> {
    const { count } = await this.db.idempotencyKey.deleteMany({
      where: { createdAt: { lt: before } },
    });
    return count;
  }

  private insert(
    day: string,
    build: (number: number) => Order,
    actorEmail: string,
    idempotencyKey: string | undefined,
  ): Promise<{ order: Order; event: OrderEvent }> {
    return this.db.$transaction(async (tx) => {
      // native upsert: one atomic INSERT ... ON CONFLICT DO UPDATE, so parallel creates never share a number
      const counter = await tx.dailyCounter.upsert({
        where: { day },
        create: { day, last: 1 },
        update: { last: { increment: 1 } },
      });
      const order = build(counter.last);
      const delivery = order.delivery;

      await tx.order.create({
        data: {
          id: order.id,
          day,
          number: order.number,
          customerName: order.customerName,
          channel: order.channel,
          status: order.status,
          version: order.version,
          statusChangedAt: order.statusChangedAt,
          externalId: order.externalId,
          deliveryCep: delivery?.cep,
          deliveryStreet: delivery?.street,
          deliveryNumber: delivery?.number,
          deliveryDistrict: delivery?.district,
          deliveryCity: delivery?.city,
          deliveryState: delivery?.state,
          createdAt: order.createdAt,
          items: {
            create: order.items.map((item, position) => ({ position, ...item })),
          },
        },
      });

      if (idempotencyKey) {
        await tx.idempotencyKey.create({ data: { key: idempotencyKey, orderId: order.id } });
      }

      const event = await tx.event.create({
        data: {
          type: 'ORDER_CREATED',
          orderId: order.id,
          toStatus: order.status,
          version: order.version,
          actorEmail,
          createdAt: order.createdAt,
        },
      });

      return { order, event: toEvent(event) };
    });
  }

  async saveMove(order: Order, actorEmail: string): Promise<OrderEvent> {
    return this.db.$transaction(async (tx) => {
      const previousVersion = order.version - 1;
      const previous = await tx.order.findUnique({
        where: { id: order.id },
        select: { status: true, version: true },
      });

      // conditional on the version: of two parallel moves, the database lets only one through
      const { count } = await tx.order.updateMany({
        where: { id: order.id, version: previousVersion },
        data: {
          status: order.status,
          version: order.version,
          statusChangedAt: order.statusChangedAt,
          lateSince: null,
        },
      });
      if (count === 0 || !previous) {
        throw new AppError('ORDER_CHANGED');
      }

      const event = await tx.event.create({
        data: {
          type: 'ORDER_STATUS_CHANGED',
          orderId: order.id,
          fromStatus: previous.status,
          toStatus: order.status,
          version: order.version,
          actorEmail,
          createdAt: order.statusChangedAt,
        },
      });
      return toEvent(event);
    });
  }

  async saveLate(order: Order): Promise<OrderEvent | null> {
    return this.db.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: order.id, version: order.version, status: 'PREPARING', lateSince: null },
        data: { lateSince: order.lateSince },
      });
      if (count === 0) {
        return null;
      }
      const event = await tx.event.create({
        data: {
          type: 'ORDER_LATE',
          orderId: order.id,
          fromStatus: order.status,
          toStatus: order.status,
          version: order.version,
          actorEmail: SYSTEM_ACTOR,
          createdAt: order.lateSince ?? new Date(),
        },
      });
      return toEvent(event);
    });
  }

  async findById(id: string): Promise<Order | null> {
    const row = await this.db.order.findUnique({ where: { id }, include: withItems });
    return row ? toOrder(row) : null;
  }

  async findByIds(ids: string[]): Promise<Order[]> {
    const rows = await this.db.order.findMany({ where: { id: { in: ids } }, include: withItems });
    return rows.map(toOrder);
  }

  async findByDay(day: string): Promise<Order[]> {
    const rows = await this.db.order.findMany({
      where: { day },
      include: withItems,
      orderBy: { number: 'asc' },
    });
    return rows.map(toOrder);
  }

  async findEventsAfter(after: number, limit: number): Promise<OrderEvent[]> {
    const rows = await this.db.event.findMany({
      where: { seq: { gt: after } },
      orderBy: { seq: 'asc' },
      take: limit,
    });
    return rows.map(toEvent);
  }

  async lastSeq(): Promise<number> {
    const last = await this.db.event.findFirst({ orderBy: { seq: 'desc' }, select: { seq: true } });
    return last ? Number(last.seq) : 0;
  }

  async findEventsOf(orderId: string): Promise<OrderEvent[]> {
    const rows = await this.db.event.findMany({ where: { orderId }, orderBy: { seq: 'asc' } });
    return rows.map(toEvent);
  }
}

function toOrder(row: OrderWithItems): Order {
  const hasDelivery = row.deliveryCep !== null;
  return Order.restore({
    id: row.id,
    number: row.number,
    customerName: row.customerName,
    channel: row.channel,
    items: row.items.map(({ sku, name, quantity }) => ({ sku, name, quantity })),
    delivery: hasDelivery
      ? {
          cep: row.deliveryCep ?? '',
          street: row.deliveryStreet ?? '',
          number: row.deliveryNumber ?? '',
          district: row.deliveryDistrict ?? '',
          city: row.deliveryCity ?? '',
          state: row.deliveryState ?? '',
        }
      : null,
    status: row.status,
    version: row.version,
    statusChangedAt: row.statusChangedAt,
    lateSince: row.lateSince,
    externalId: row.externalId,
    createdAt: row.createdAt,
  });
}

function toEvent(row: Event): OrderEvent {
  return {
    seq: Number(row.seq),
    type: row.type,
    orderId: row.orderId,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    version: row.version,
    actorEmail: row.actorEmail,
    createdAt: row.createdAt,
  };
}
