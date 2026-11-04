import type { Actor } from '../src/application/auth.ports';
import { MarkLateUseCase } from '../src/application/late-orders';
import { CreateOrderUseCase, MoveOrderUseCase } from '../src/application/order.use-cases';
import { BullLateOrderTimer } from '../src/infra/late-orders.queue';
import { PrismaOrderRepository } from '../src/infra/prisma-order.repository';
import { PrismaService } from '../src/infra/prisma.service';
import { InProcessEventBus } from '../src/realtime/event-bus';

// Needs both a real database and Redis (CI sets DATABASE_URL and REDIS_URL).
const redisUrl = process.env.REDIS_URL;
const describeWithServices = process.env.DATABASE_URL && redisUrl ? describe : describe.skip;

describeWithServices('late-order alert with a 1 s delay', () => {
  const staff: Actor = { id: 'u1', email: 'staff@example.com', role: 'STAFF' };
  let db: PrismaService;
  let timer: BullLateOrderTimer;
  let create: CreateOrderUseCase;
  let move: MoveOrderUseCase;
  const messages: string[] = [];

  beforeAll(async () => {
    db = new PrismaService();
    const orders = new PrismaOrderRepository(db);
    const bus = new InProcessEventBus();
    bus.onMessage((message) => messages.push(message));
    timer = new BullLateOrderTimer(redisUrl ?? '', 1000, new MarkLateUseCase(orders, bus));
    create = new CreateOrderUseCase(orders, bus);
    move = new MoveOrderUseCase(orders, bus, timer);
    await db.event.deleteMany();
    await db.order.deleteMany();
  });

  afterAll(async () => {
    await timer.onModuleDestroy();
    await db.$disconnect();
  });

  const newOrder = () =>
    create.execute(
      { customerName: 'Ana', items: [{ sku: 'BRG-01', name: 'Burger', quantity: 1 }] },
      staff,
    );
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('flags an order still PREPARING after the delay and publishes ORDER_LATE', async () => {
    const { order } = await newOrder();
    await move.execute({ id: order.id, to: 'PREPARING', version: 1 }, staff);

    await wait(2500);

    const stored = await db.order.findUnique({ where: { id: order.id } });
    expect(stored?.lateSince).toBeInstanceOf(Date);
    expect(stored?.version).toBe(2);
    const late = await db.event.findMany({ where: { orderId: order.id, type: 'ORDER_LATE' } });
    expect(late).toHaveLength(1);
    expect(messages.some((message) => message.includes('"ORDER_LATE"'))).toBe(true);
  });

  it('does nothing for an order that moved on before the delay', async () => {
    const { order } = await newOrder();
    await move.execute({ id: order.id, to: 'PREPARING', version: 1 }, staff);
    await move.execute({ id: order.id, to: 'READY', version: 2 }, staff);

    await wait(2500);

    const stored = await db.order.findUnique({ where: { id: order.id } });
    expect(stored?.lateSince).toBeNull();
    expect(await db.event.count({ where: { orderId: order.id, type: 'ORDER_LATE' } })).toBe(0);
  });
});
