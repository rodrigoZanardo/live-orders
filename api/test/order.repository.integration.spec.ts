import { randomUUID } from 'crypto';
import { AppError } from '../src/domain/errors';
import { Order } from '../src/domain/order';
import { PrismaOrderRepository } from '../src/infra/prisma-order.repository';
import { PrismaService } from '../src/infra/prisma.service';

// Runs only with a real database (CI sets DATABASE_URL); the unit tests cover the rules without one.
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('PrismaOrderRepository on a real database', () => {
  const day = '2026-11-03';
  const now = new Date('2026-11-03T12:00:00Z');
  let db: PrismaService;
  let repo: PrismaOrderRepository;

  const newOrder = (number: number) =>
    Order.create({
      id: randomUUID(),
      number,
      customerName: 'Ana',
      channel: 'COUNTER',
      items: [
        { sku: 'BRG-01', name: 'Burger', quantity: 2 },
        { sku: 'FRY-01', name: 'Fries', quantity: 1 },
      ],
      now,
    });

  beforeAll(async () => {
    db = new PrismaService();
    repo = new PrismaOrderRepository(db);
    await db.$connect();
  });

  beforeEach(async () => {
    await db.event.deleteMany();
    await db.order.deleteMany();
    await db.dailyCounter.deleteMany();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('saves the order with its ORDER_CREATED event and reads it back', async () => {
    const { order, event } = await repo.create(day, newOrder, 'staff@example.com');

    expect(order.number).toBe(1);
    expect(event).toMatchObject({
      type: 'ORDER_CREATED',
      orderId: order.id,
      fromStatus: null,
      toStatus: 'RECEIVED',
      version: 1,
      actorEmail: 'staff@example.com',
    });

    const stored = await repo.findById(order.id);
    expect(stored?.items).toEqual(order.items);
    expect(await repo.findEventsOf(order.id)).toEqual([event]);
  });

  it('gives parallel creates distinct daily numbers, restarting each day', async () => {
    const created = await Promise.all(
      Array.from({ length: 5 }, () => repo.create(day, newOrder, 'staff@example.com')),
    );
    const numbers = created.map(({ order }) => order.number).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5]);

    const nextDay = await repo.create('2026-11-04', newOrder, 'staff@example.com');
    expect(nextDay.order.number).toBe(1);
    expect((await repo.findByDay(day)).map((order) => order.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it('saves nothing and keeps the number free when building the order fails', async () => {
    const failing = () => {
      throw new AppError('ITEMS_INVALID');
    };
    await expect(repo.create(day, failing, 'staff@example.com')).rejects.toThrow(AppError);

    const { order } = await repo.create(day, newOrder, 'staff@example.com');
    expect(order.number).toBe(1);
    expect(await repo.findEventsAfter(0, 500)).toHaveLength(1);
  });

  it('lets only one of two concurrent moves win; the loser writes no event', async () => {
    const { order } = await repo.create(day, newOrder, 'staff@example.com');

    // two copies at version 1, as two people reading the board at the same moment
    const first = await repo.findById(order.id);
    const second = await repo.findById(order.id);
    if (!first || !second) throw new Error('order was not saved');
    first.moveTo('PREPARING', 1, now);
    second.moveTo('CANCELLED', 1, now);

    const results = await Promise.allSettled([
      repo.saveMove(first, 'ana@example.com'),
      repo.saveMove(second, 'bia@example.com'),
    ]);

    const won = results.filter((result) => result.status === 'fulfilled');
    const lost = results.filter((result) => result.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0]).toMatchObject({ reason: { code: 'ORDER_CHANGED' } });

    const events = await repo.findEventsOf(order.id);
    expect(events.map((event) => event.type)).toEqual(['ORDER_CREATED', 'ORDER_STATUS_CHANGED']);
    const stored = await repo.findById(order.id);
    expect(stored?.version).toBe(2);
    expect(stored?.status).toBe(events[1]?.toStatus);
    expect(events[1]?.fromStatus).toBe('RECEIVED');
  });

  it('returns events after a sequence number, oldest first, up to the limit', async () => {
    const { order } = await repo.create(day, newOrder, 'staff@example.com');
    const moved = await repo.findById(order.id);
    if (!moved) throw new Error('order was not saved');
    moved.moveTo('PREPARING', 1, now);
    await repo.saveMove(moved, 'staff@example.com');

    const all = await repo.findEventsAfter(0, 500);
    expect(all.map((event) => event.seq)).toEqual([...all.map((event) => event.seq)].sort((a, b) => a - b));
    expect(await repo.findEventsAfter(all[0]?.seq ?? 0, 500)).toEqual(all.slice(1));
    expect(await repo.findEventsAfter(0, 1)).toEqual(all.slice(0, 1));
  });
});
