import { createServer, type IncomingMessage, type Server } from 'http';
import type { AddressInfo } from 'net';
import {
  CreateSubscriptionUseCase,
  DeliverWebhookUseCase,
  WebhookDispatch,
} from '../src/application/outgoing-webhooks';
import type { EventWithOrder } from '../src/application/order.use-cases';
import { Order } from '../src/domain/order';
import { signWebhook } from '../src/domain/webhook-signature';
import { PrismaService } from '../src/infra/prisma.service';
import { PrismaWebhookRepository } from '../src/infra/prisma-webhook.repository';
import { BullDeliveryQueue, FetchWebhookSender } from '../src/infra/webhook-delivery.queue';

// Needs a real database and Redis (CI sets DATABASE_URL and REDIS_URL).
const redisUrl = process.env.REDIS_URL;
const describeWithServices = process.env.DATABASE_URL && redisUrl ? describe : describe.skip;

type Received = {
  body: string;
  signature: string;
  timestamp: string;
  seq: string;
  deliveryId: string;
};

function header(request: IncomingMessage, name: string): string {
  const value = request.headers[name];
  return typeof value === 'string' ? value : '';
}

// the receiver runs on localhost
process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS = 'true';

describeWithServices('outgoing webhooks through the queue', () => {
  const now = new Date('2026-11-03T12:00:00Z');
  let db: PrismaService;
  let receiver: Server;
  let baseUrl: string;
  let queue: BullDeliveryQueue;
  let dispatch: WebhookDispatch;
  let createSubscription: CreateSubscriptionUseCase;
  /** Answers per path: how many first requests fail before it accepts (Infinity = always fails). */
  const failFirst: Record<string, number> = {};
  const received: Record<string, Received[]> = {};
  let seq = 1000;

  beforeAll(async () => {
    receiver = createServer((request, response) => {
      const path = request.url ?? '';
      let body = '';
      request.on('data', (chunk: Buffer) => (body += chunk.toString()));
      request.on('end', () => {
        const calls = (received[path] ??= []);
        calls.push({
          body,
          signature: header(request, 'x-signature'),
          timestamp: header(request, 'x-timestamp'),
          seq: header(request, 'x-event-seq'),
          deliveryId: header(request, 'x-delivery-id'),
        });
        response.statusCode = calls.length <= (failFirst[path] ?? 0) ? 500 : 200;
        response.end();
      });
    });
    await new Promise<void>((resolve) => receiver.listen(0, resolve));
    const address: AddressInfo | string | null = receiver.address();
    if (!address || typeof address === 'string') throw new Error('receiver has no port');
    baseUrl = `http://127.0.0.1:${address.port}`;

    db = new PrismaService();
    const repository = new PrismaWebhookRepository(db);
    const deliver = new DeliverWebhookUseCase(repository, new FetchWebhookSender());
    // same retry count as production (3 retries), with short delays for the test
    queue = new BullDeliveryQueue(redisUrl ?? '', deliver, [50, 50, 50]);
    dispatch = new WebhookDispatch(repository, queue, (event) =>
      JSON.stringify({ seq: event.seq, type: event.type }),
    );
    createSubscription = new CreateSubscriptionUseCase(repository);
    await db.webhookSubscription.deleteMany();
  });

  afterAll(async () => {
    await queue.onModuleDestroy();
    await db.$disconnect();
    await new Promise((resolve) => receiver.close(resolve));
  });

  const event = (): EventWithOrder => ({
    seq: ++seq,
    type: 'ORDER_STATUS_CHANGED',
    orderId: 'o1',
    fromStatus: 'READY',
    toStatus: 'DELIVERED',
    version: 4,
    actorEmail: 'staff@example.com',
    createdAt: now,
    order: Order.create({
      id: 'o1',
      number: 1,
      customerName: 'Ana',
      channel: 'COUNTER',
      items: [{ sku: 'KB-001', name: 'Keyboard', quantity: 1 }],
      now,
    }),
  });

  async function waitForStatus(eventSeq: number, status: 'SENT' | 'FAILED') {
    for (let i = 0; i < 100; i++) {
      const delivery = await db.webhookDelivery.findFirst({
        where: { eventSeq: BigInt(eventSeq) },
      });
      if (delivery?.status === status) return delivery;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`delivery for event ${eventSeq} never became ${status}`);
  }

  it('retries a receiver that fails twice, then records it as SENT with a valid signature', async () => {
    failFirst['/flaky'] = 2;
    const subscription = await createSubscription.execute(`${baseUrl}/flaky`);
    const sent = event();

    await dispatch.publish(sent);
    const delivery = await waitForStatus(sent.seq, 'SENT');

    expect(delivery.attempts).toBe(3);
    const calls = received['/flaky'] ?? [];
    expect(calls).toHaveLength(3);
    const last = calls[2];
    expect(last?.seq).toBe(String(sent.seq));
    expect(last?.deliveryId).toBe(delivery.id);
    expect(last?.signature).toBe(
      signWebhook(subscription.secret, last?.timestamp ?? '', last?.body ?? ''),
    );
    await db.webhookSubscription.delete({ where: { id: subscription.id } });
  });

  it('gives up after the last retry and records FAILED with the last error', async () => {
    failFirst['/down'] = Infinity;
    const subscription = await createSubscription.execute(`${baseUrl}/down`);
    const sent = event();

    await dispatch.publish(sent);
    const delivery = await waitForStatus(sent.seq, 'FAILED');

    expect(delivery.attempts).toBe(4);
    expect(delivery.lastError).toBe('HTTP 500');
    await db.webhookSubscription.delete({ where: { id: subscription.id } });
  });

  it('finds PENDING deliveries idle since before the cut-off, and only those', async () => {
    const subscription = await createSubscription.execute(`${baseUrl}/stale`);
    const make = (status: 'PENDING' | 'SENT', updatedAt = new Date()) =>
      db.webhookDelivery.create({
        data: {
          subscriptionId: subscription.id,
          eventSeq: BigInt(++seq),
          eventType: 'ORDER_STATUS_CHANGED',
          payload: '{}',
          status,
          updatedAt,
        },
      });
    const old = new Date(Date.now() - 600_000);
    const stale = await make('PENDING', old);
    const sent = await make('SENT', old);
    const fresh = await make('PENDING');

    const ids = await new PrismaWebhookRepository(db).findStalePending(
      new Date(Date.now() - 120_000),
    );
    expect(ids).toContain(stale.id);
    expect(ids).not.toContain(sent.id);
    expect(ids).not.toContain(fresh.id);
    await db.webhookSubscription.delete({ where: { id: subscription.id } });
  });

  it('refuses a URL that is not http(s)', async () => {
    await expect(createSubscription.execute('ftp://example.com')).rejects.toMatchObject({
      code: 'WEBHOOK_URL_INVALID',
    });
  });
});
