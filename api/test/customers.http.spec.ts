import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PasswordHasher, TokenService, UserRepository } from '../src/application/auth.ports';
import { OrderRepository } from '../src/application/order-repository';
import { LateOrderTimer } from '../src/application/late-orders';
import { DeliveryQueue } from '../src/application/outgoing-webhooks';
import { LiveTickets } from '../src/application/live-tickets';
import { CleanupQueue } from '../src/infra/cleanup.queue';
import { configureApp } from '../src/http/configure-app';
import { EventBus, InProcessEventBus } from '../src/realtime/event-bus';
import { PrismaService } from '../src/infra/prisma.service';
import {
  CUSTOMER_PROFILE,
  FakePasswordHasher,
  FakeTokenService,
  InMemoryLiveTickets,
  InMemoryUserRepository,
  NoDeliveryQueue,
  NoLateTimer,
} from './fakes';

/** Sign-up and the role walls around customers, without a database: the guard refuses before any repository. */
describe('customers over HTTP', () => {
  let app: INestApplication;
  const tokens = new FakeTokenService();
  const orderId = '00000000-0000-4000-8000-000000000001';

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
      .overrideProvider(EventBus)
      .useValue(new InProcessEventBus())
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(OrderRepository)
      .useValue({})
      .overrideProvider(UserRepository)
      .useValue(new InMemoryUserRepository())
      .overrideProvider(PasswordHasher)
      .useValue(new FakePasswordHasher())
      .overrideProvider(TokenService)
      .useValue(tokens)
      .overrideProvider(LiveTickets)
      .useValue(new InMemoryLiveTickets())
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(() => app.close());

  const http = () => request(app.getHttpServer());
  const register = (email: string) =>
    http()
      .post('/auth/register')
      .send({ email, password: 'customer-password', ...CUSTOMER_PROFILE });

  it('signs up a CUSTOMER and signs them in; the same email again is EMAIL_TAKEN', async () => {
    const created = await register('ana@example.com');
    expect(created.status).toBe(201);
    expect(created.body.user).toMatchObject({ email: 'ana@example.com', role: 'CUSTOMER' });
    expect(await tokens.verify(created.body.token)).toEqual(created.body.user);

    const again = await register('ANA@example.com');
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('EMAIL_TAKEN');

    const login = await http()
      .post('/auth/login')
      .send({ email: 'ana@example.com', password: 'customer-password' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('CUSTOMER');
  });

  it('refuses a sign-up that asks for a role', async () => {
    const response = await http()
      .post('/auth/register')
      .send({
        email: 'x@example.com',
        password: 'long-enough',
        role: 'ADMIN',
        ...CUSTOMER_PROFILE,
      });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_INPUT');
  });

  it('answers 403 to a CUSTOMER on every staff endpoint', async () => {
    const token = await tokens.issue({ id: 'c1', email: 'c@example.com', role: 'CUSTOMER' });
    const calls = {
      'GET /orders': () => http().get('/orders'),
      'GET /orders/:id': () => http().get(`/orders/${orderId}`),
      'POST /orders': () => http().post('/orders').send({ customerName: 'X', items: [] }),
      'POST /orders/:id/status': () =>
        http().post(`/orders/${orderId}/status`).send({ to: 'CANCELLED', version: 1 }),
      'GET /events': () => http().get('/events'),
      'GET /events/last': () => http().get('/events/last'),
      'POST /live/ticket': () => http().post('/live/ticket'),
      'GET /users': () => http().get('/users'),
      'GET /webhook-subscriptions': () => http().get('/webhook-subscriptions'),
      'GET /webhook-deliveries': () => http().get('/webhook-deliveries'),
    };
    for (const [route, call] of Object.entries(calls)) {
      const response = await call().set('Authorization', `Bearer ${token}`);
      expect([route, response.status, response.body.code]).toEqual([route, 403, 'FORBIDDEN']);
    }
  });

  it('keeps /my/orders for customers only', async () => {
    const staff = await tokens.issue({ id: 's1', email: 's@example.com', role: 'STAFF' });
    const response = await http().get('/my/orders').set('Authorization', `Bearer ${staff}`);
    expect(response.status).toBe(403);
    expect((await http().get('/my/orders')).status).toBe(401);
  });
});
