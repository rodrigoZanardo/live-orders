import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PasswordHasher, TokenService, UserRepository } from '../src/application/auth.ports';
import { OrderRepository } from '../src/application/order-repository';
import { LateOrderTimer } from '../src/application/late-orders';
import { DeliveryQueue } from '../src/application/outgoing-webhooks';
import { CleanupQueue } from '../src/infra/cleanup.queue';
import { configureApp } from '../src/http/configure-app';
import { EventBus, InProcessEventBus } from '../src/realtime/event-bus';
import { PrismaService } from '../src/infra/prisma.service';
import {
  FakePasswordHasher,
  FakeTokenService,
  InMemoryUserRepository,
  NoDeliveryQueue,
  NoLateTimer,
} from './fakes';

/** The real module and HTTP setup, with in-memory users: checks the guard, roles and error format. */
describe('auth over HTTP', () => {
  let app: INestApplication;
  const tokens = new FakeTokenService();

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
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(() => app.close());

  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/auth/login').send({ email, password });

  it('signs in the admin created from env', async () => {
    const response = await login('admin@example.com', 'admin-password');
    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ email: 'admin@example.com', role: 'ADMIN' });
  });

  it('answers a wrong password with 401 in the error format', async () => {
    const response = await login('admin@example.com', 'wrong');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
      params: {},
    });
  });

  it('refuses a request without a token with SESSION_INVALID', async () => {
    const response = await request(app.getHttpServer()).get('/users');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('SESSION_INVALID');
  });

  it('lets an admin create a user, and refuses that STAFF user on admin routes', async () => {
    const admin = (await login('admin@example.com', 'admin-password')).body.token;
    const created = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${admin}`)
      .send({ email: 'staff@example.com', password: 'staff-password', role: 'STAFF' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ email: 'staff@example.com', role: 'STAFF' });

    const staff = (await login('staff@example.com', 'staff-password')).body.token;
    const forbidden = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${staff}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
  });

  it('turns invalid input into INVALID_INPUT', async () => {
    const admin = (await login('admin@example.com', 'admin-password')).body.token;
    const response = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${admin}`)
      .send({ email: 'x@example.com', password: 'long-enough', role: 'OWNER' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_INPUT');
  });
});
