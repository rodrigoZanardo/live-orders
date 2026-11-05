import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PasswordHasher, TokenService } from '../src/application/auth.ports';
import { LateOrderTimer } from '../src/application/late-orders';
import { StockAvailability } from '../src/application/stock-availability';
import { DeliveryQueue } from '../src/application/outgoing-webhooks';
import { LiveTickets } from '../src/application/live-tickets';
import { CleanupQueue } from '../src/infra/cleanup.queue';
import { configureApp } from '../src/http/configure-app';
import { EventBus, InProcessEventBus } from '../src/realtime/event-bus';
import { PrismaService } from '../src/infra/prisma.service';
import { FakeStockAvailability } from './fake-stock';
import {
  CUSTOMER_PROFILE,
  FakePasswordHasher,
  FakeTokenService,
  InMemoryLiveTickets,
  NoDeliveryQueue,
  NoLateTimer,
} from './fakes';

// Customer orders on a real database (users too, for the owner link); skipped without DATABASE_URL.
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('my orders over HTTP', () => {
  let app: INestApplication;
  let db: PrismaService;
  const tokens = new FakeTokenService();
  let staffToken: string;
  const items = [{ sku: 'flt-01', name: 'Oil filter', quantity: 2 }];

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
      .overrideProvider(PasswordHasher)
      .useValue(new FakePasswordHasher())
      .overrideProvider(TokenService)
      .useValue(tokens)
      .overrideProvider(StockAvailability)
      .useValue(new FakeStockAvailability())
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    staffToken = await tokens.issue({ id: 's1', email: 'staff@example.com', role: 'STAFF' });
  });

  beforeEach(async () => {
    await db.event.deleteMany();
    await db.order.deleteMany();
    await db.dailyCounter.deleteMany();
    await db.user.deleteMany({ where: { role: 'CUSTOMER' } });
  });

  afterAll(() => app.close());

  const http = () => request(app.getHttpServer());
  const signUp = async (email: string, name: string): Promise<string> => {
    const response = await http()
      .post('/auth/register')
      .send({ email, password: 'customer-password', ...CUSTOMER_PROFILE, name });
    expect(response.status).toBe(201);
    return response.body.token;
  };
  const place = (token: string) =>
    http()
      .post('/my/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items, paymentMethod: 'PIX' });
  const mine = (token: string) => http().get('/my/orders').set('Authorization', `Bearer ${token}`);

  it('places a delivery order under the account name and address', async () => {
    const ana = await signUp('ana@example.com', 'Ana');
    const created = await place(ana);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      customerName: 'Ana',
      status: 'RECEIVED',
      items: [{ sku: 'FLT-01', quantity: 2 }],
      delivery: { cep: '01001000', street: 'Praça da Sé', number: '100 - apto 12', state: 'SP' },
    });

    // the board sees it like any other order
    const board = await http().get('/orders').set('Authorization', `Bearer ${staffToken}`);
    expect(board.body.map((order: { id: string }) => order.id)).toEqual([created.body.id]);
  });

  it('stores the stock name and price, never the name the customer sent', async () => {
    const ana = await signUp('ana@example.com', 'Ana');
    const created = await http()
      .post('/my/orders')
      .set('Authorization', `Bearer ${ana}`)
      .send({
        items: [{ sku: 'flt-01', name: 'Free gift', quantity: 2 }],
        paymentMethod: 'CASH',
        changeFor: 5000,
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ total: 2000, paymentMethod: 'CASH', changeFor: 5000 });
    const stored = await db.orderItem.findMany({ where: { orderId: created.body.id } });
    expect(stored).toMatchObject([{ sku: 'FLT-01', name: 'Stock flt-01', unitPrice: 1000 }]);
    expect((await mine(ana)).body[0].items).toEqual([
      { sku: 'FLT-01', name: 'Stock flt-01', quantity: 2, unitPrice: 1000 },
    ]);
  });

  it('requires a payment method, and change of at least the total', async () => {
    const ana = await signUp('ana@example.com', 'Ana');
    const send = (body: object) =>
      http()
        .post('/my/orders')
        .set('Authorization', `Bearer ${ana}`)
        .send({ items, ...body });
    expect((await send({})).body.code).toBe('INVALID_INPUT');
    expect((await send({ paymentMethod: 'CASH', changeFor: 1999 })).body.code).toBe(
      'CHANGE_FOR_INVALID',
    );
    expect((await send({ paymentMethod: 'CARD', changeFor: 5000 })).body.code).toBe(
      'CHANGE_FOR_INVALID',
    );
  });

  it('refuses a name or address sent in the body', async () => {
    const ana = await signUp('ana@example.com', 'Ana');
    const response = await http()
      .post('/my/orders')
      .set('Authorization', `Bearer ${ana}`)
      .send({ items, customerName: 'Someone else' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_INPUT');
  });

  it('lists only my orders, and refuses to cancel someone else’s', async () => {
    const ana = await signUp('ana@example.com', 'Ana');
    const bia = await signUp('bia@example.com', 'Bia');
    const anaOrder = (await place(ana)).body;
    const biaOrder = (await place(bia)).body;
    await staffCreates();

    expect((await mine(ana)).body.map((order: { id: string }) => order.id)).toEqual([anaOrder.id]);
    expect((await mine(bia)).body.map((order: { id: string }) => order.id)).toEqual([biaOrder.id]);

    const other = await http()
      .post(`/my/orders/${biaOrder.id}/cancel`)
      .set('Authorization', `Bearer ${ana}`)
      .send({ version: 1 });
    expect(other.status).toBe(404);
    expect(other.body.code).toBe('ORDER_NOT_FOUND');
  });

  it('cancels my order while RECEIVED, not once staff started it', async () => {
    const ana = await signUp('ana@example.com', 'Ana');
    const first = (await place(ana)).body;
    const cancelled = await http()
      .post(`/my/orders/${first.id}/cancel`)
      .set('Authorization', `Bearer ${ana}`)
      .send({ version: 1 });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', version: 2 });

    const second = (await place(ana)).body;
    await http()
      .post(`/orders/${second.id}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ to: 'PREPARING', version: 1 });
    const late = await http()
      .post(`/my/orders/${second.id}/cancel`)
      .set('Authorization', `Bearer ${ana}`)
      .send({ version: 2 });
    expect(late.status).toBe(400);
    expect(late.body.code).toBe('STATUS_MOVE_INVALID');
  });

  async function staffCreates(): Promise<void> {
    const response = await http()
      .post('/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ customerName: 'Counter', items });
    expect(response.status).toBe(201);
  }
});
