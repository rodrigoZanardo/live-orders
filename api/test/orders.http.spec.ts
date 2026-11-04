import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService, UserRepository, type Actor } from '../src/application/auth.ports';
import { LateOrderTimer } from '../src/application/late-orders';
import { StockAvailability } from '../src/application/stock-availability';
import { FakeStockAvailability } from './fake-stock';
import { DeliveryQueue } from '../src/application/outgoing-webhooks';
import { LiveTickets } from '../src/application/live-tickets';
import { CleanupQueue } from '../src/infra/cleanup.queue';
import { configureApp } from '../src/http/configure-app';
import { EventBus, InProcessEventBus } from '../src/realtime/event-bus';
import { PrismaService } from '../src/infra/prisma.service';
import {
  FakeTokenService,
  InMemoryLiveTickets,
  InMemoryUserRepository,
  NoDeliveryQueue,
  NoLateTimer,
} from './fakes';

// The whole orders API on a real database (skipped without DATABASE_URL); tokens are faked.
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('orders API over HTTP', () => {
  let app: INestApplication;
  let db: PrismaService;
  const tokens = new FakeTokenService();
  const staff: Actor = { id: 'u-staff', email: 'staff@example.com', role: 'STAFF' };
  const viewer: Actor = { id: 'u-viewer', email: 'viewer@example.com', role: 'VIEWER' };
  let staffToken: string;
  let viewerToken: string;

  const order = {
    customerName: 'Ana',
    items: [{ sku: 'brg-01', name: 'Burger', quantity: 2 }],
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'admin-password';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DeliveryQueue)
      .useValue(new NoDeliveryQueue())
      .overrideProvider(CleanupQueue)
      .useValue({})
      .overrideProvider(LateOrderTimer)
      .useValue(new NoLateTimer())
      .overrideProvider(LiveTickets)
      .useValue(new InMemoryLiveTickets())
      .overrideProvider(EventBus)
      .useValue(new InProcessEventBus())
      .overrideProvider(UserRepository)
      .useValue(new InMemoryUserRepository())
      .overrideProvider(TokenService)
      .useValue(tokens)
      .overrideProvider(StockAvailability)
      .useValue(new FakeStockAvailability())
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    staffToken = await tokens.issue(staff);
    viewerToken = await tokens.issue(viewer);
  });

  beforeEach(async () => {
    await db.event.deleteMany();
    await db.order.deleteMany();
    await db.dailyCounter.deleteMany();
  });

  afterAll(() => app.close());

  const http = () => request(app.getHttpServer());
  const create = () =>
    http().post('/orders').set('Authorization', `Bearer ${staffToken}`).send(order);

  it('creates an order, lists it for today and returns it with its timeline', async () => {
    const created = await create();
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      type: 'ORDER_CREATED',
      actorEmail: 'staff@example.com',
      order: { number: 1, status: 'RECEIVED', version: 1, items: [{ sku: 'BRG-01' }] },
    });

    const list = await http().get('/orders').set('Authorization', `Bearer ${viewerToken}`);
    expect(list.status).toBe(200);
    expect(list.body.map((item: { id: string }) => item.id)).toEqual([created.body.order.id]);

    const detail = await http()
      .get(`/orders/${created.body.order.id}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(detail.body.events).toHaveLength(1);
  });

  it('refuses domain rule breaks with their codes', async () => {
    const response = await http()
      .post('/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ ...order, items: [{ sku: 'X', name: 'X', quantity: 100 }] });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('ITEMS_INVALID');
  });

  it('does not let a viewer create or move orders', async () => {
    const response = await http()
      .post('/orders')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send(order);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('moves an order, then refuses the same old version with 409 ORDER_CHANGED', async () => {
    const { id } = (await create()).body.order;
    const move = (to: string, version: number) =>
      http()
        .post(`/orders/${id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ to, version });

    const moved = await move('PREPARING', 1);
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({
      fromStatus: 'RECEIVED',
      toStatus: 'PREPARING',
      order: { version: 2 },
    });

    const stale = await move('CANCELLED', 1);
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('ORDER_CHANGED');

    const invalid = await move('DELIVERED', 2);
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({
      code: 'STATUS_MOVE_INVALID',
      params: { from: 'PREPARING', to: 'DELIVERED' },
    });
  });

  it('answers 404 for a missing or malformed order id', async () => {
    for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      const response = await http()
        .get(`/orders/${id}`)
        .set('Authorization', `Bearer ${viewerToken}`);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ORDER_NOT_FOUND');
    }
  });

  it('returns events after a sequence number with the current order', async () => {
    const first = (await create()).body;
    const second = (await create()).body;

    const response = await http()
      .get(`/events?after=${first.seq}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(response.status).toBe(200);
    expect(response.body.map((event: { seq: number }) => event.seq)).toEqual([second.seq]);
    expect(response.body[0].order.id).toBe(second.order.id);

    const last = await http().get('/events/last').set('Authorization', `Bearer ${viewerToken}`);
    expect(last.body).toEqual({ lastSeq: second.seq });
  });

  it('refuses an impossible date with INVALID_INPUT', async () => {
    const response = await http()
      .get('/orders?date=2026-13-45')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_INPUT');
  });

  it('answers health without a token', async () => {
    expect((await http().get('/health')).body).toEqual({ status: 'ok' });
  });
});
