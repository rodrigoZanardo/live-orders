import type { EventWithOrder } from '../src/application/order.use-cases';
import { Order } from '../src/domain/order';
import { RedisEventBus } from '../src/realtime/event-bus';

// Runs only with a real Redis (CI sets REDIS_URL).
const redisUrl = process.env.REDIS_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('RedisEventBus between two API instances', () => {
  const now = new Date('2026-11-03T12:00:00Z');
  const event: EventWithOrder = {
    seq: 42,
    type: 'ORDER_CREATED',
    orderId: 'o1',
    fromStatus: null,
    toStatus: 'RECEIVED',
    version: 1,
    actorEmail: 'staff@example.com',
    createdAt: now,
    order: Order.create({
      id: 'o1',
      number: 1,
      customerName: 'Ana',
      channel: 'COUNTER',
      items: [{ sku: 'BRG-01', name: 'Burger', quantity: 1 }],
      now,
    }),
  };
  const buses: RedisEventBus[] = [];

  afterAll(() => Promise.all(buses.map((bus) => bus.onModuleDestroy())));

  const nextMessage = (bus: RedisEventBus) =>
    new Promise<string>((resolve) => bus.onMessage(resolve));

  it('delivers an event published on one instance to both', async () => {
    const first = new RedisEventBus(redisUrl ?? '');
    const second = new RedisEventBus(redisUrl ?? '');
    buses.push(first, second);
    // wait until both subscriptions are active
    await new Promise((resolve) => setTimeout(resolve, 300));

    const received = Promise.all([nextMessage(first), nextMessage(second)]);
    await first.publish(event);

    for (const message of await received) {
      expect(JSON.parse(message)).toMatchObject({
        type: 'event',
        seq: 42,
        event: { seq: 42, type: 'ORDER_CREATED', order: { number: 1, customerName: 'Ana' } },
      });
    }
  });
});
