import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AddressLookup, type AddressResult } from '../src/application/address-lookup';
import { UserRepository } from '../src/application/auth.ports';
import { LateOrderTimer } from '../src/application/late-orders';
import { signWebhook } from '../src/domain/webhook-signature';
import { configureApp } from '../src/http/configure-app';
import { DeliveryQueue } from '../src/application/outgoing-webhooks';
import { LiveTickets } from '../src/application/live-tickets';
import { CleanupQueue } from '../src/infra/cleanup.queue';
import { PrismaService } from '../src/infra/prisma.service';
import { EventBus, InProcessEventBus } from '../src/realtime/event-bus';
import { InMemoryLiveTickets, InMemoryUserRepository, NoDeliveryQueue, NoLateTimer } from './fakes';

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

class FakeAddressLookup extends AddressLookup {
  async lookup(cep: string): Promise<AddressResult> {
    return cep.startsWith('01001')
      ? {
          found: true,
          address: { street: 'Praça da Sé', district: 'Sé', city: 'São Paulo', state: 'SP' },
        }
      : { found: false };
  }
}

describeWithDatabase('incoming webhook POST /webhooks/orders', () => {
  const secret = 'incoming-test-secret';
  let app: INestApplication;
  let db: PrismaService;
  let keyCounter = 0;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'admin-password';
    process.env.WEBHOOK_INCOMING_SECRET = secret;

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
      .overrideProvider(AddressLookup)
      .useValue(new FakeAddressLookup())
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
  });

  beforeEach(async () => {
    await db.event.deleteMany();
    await db.order.deleteMany();
  });

  afterAll(() => app.close());

  const body = (externalId: string, extra: object = {}) =>
    JSON.stringify({
      externalId,
      customerName: 'Bruno',
      items: [{ sku: 'KB-001', name: 'Keyboard', quantity: 1 }],
      ...extra,
    });

  function send(
    raw: string,
    options: { key?: string; secret?: string; timestamp?: number; signature?: string } = {},
  ) {
    const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
    const signature = options.signature ?? signWebhook(options.secret ?? secret, timestamp, raw);
    return request(app.getHttpServer())
      .post('/webhooks/orders')
      .set('Content-Type', 'application/json')
      .set('X-Timestamp', timestamp)
      .set('X-Signature', signature)
      .set('Idempotency-Key', options.key ?? `key-${++keyCounter}`)
      .send(raw);
  }

  it('creates a signed order from the platform', async () => {
    const response = await send(body('ext-1'));
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      channel: 'DELIVERY_PLATFORM',
      externalId: 'ext-1',
      status: 'RECEIVED',
      // platform orders keep their own names and are paid on the platform
      items: [{ sku: 'KB-001', name: 'Keyboard', quantity: 1, unitPrice: null }],
      total: null,
      paymentMethod: null,
    });
  });

  it('refuses a wrong signature', async () => {
    const response = await send(body('ext-2'), { secret: 'not-the-secret' });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('WEBHOOK_SIGNATURE_INVALID');
  });

  it('refuses a missing signature', async () => {
    const response = await send(body('ext-3'), { signature: '' });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('WEBHOOK_SIGNATURE_INVALID');
  });

  it('checks the signature before validating the body', async () => {
    const response = await send(JSON.stringify({ externalId: 'ext-x' }), { secret: 'wrong' });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('WEBHOOK_SIGNATURE_INVALID');
  });

  it('refuses a reused idempotency key with another externalId', async () => {
    expect((await send(body('ext-a'), { key: 'reused' })).status).toBe(201);
    const response = await send(body('ext-b'), { key: 'reused' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('refuses a replay older than 5 minutes', async () => {
    const response = await send(body('ext-4'), { timestamp: Math.floor(Date.now() / 1000) - 600 });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('WEBHOOK_TOO_OLD');
  });

  it('refuses a missing idempotency key and an invalid body', async () => {
    const noKey = await send(body('ext-5'), { key: '' });
    expect(noKey.status).toBe(400);
    expect(noKey.body.code).toBe('INVALID_INPUT');

    const invalid = await send(JSON.stringify({ externalId: 'ext-6' }));
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('INVALID_INPUT');
  });

  it('returns the first order for a repeated key, even when both arrive together', async () => {
    const raw = body('ext-7');
    const [first, second] = await Promise.all([
      send(raw, { key: 'same-key' }),
      send(raw, { key: 'same-key' }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(first.body.id).toBe(second.body.id);

    const again = await send(raw, { key: 'same-key' });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(await db.order.count()).toBe(1);
  });

  it('completes the address from the CEP, and keeps what was sent when the CEP is unknown', async () => {
    const found = await send(
      body('ext-8', { delivery: { cep: '01001-000', number: '1', complement: 'apt 3' } }),
    );
    expect(found.body.delivery).toEqual({
      cep: '01001000',
      number: '1 - apt 3',
      street: 'Praça da Sé',
      district: 'Sé',
      city: 'São Paulo',
      state: 'SP',
    });

    const unknown = await send(body('ext-9', { delivery: { cep: '99999-999', number: '7' } }));
    expect(unknown.status).toBe(201);
    expect(unknown.body.delivery).toMatchObject({ cep: '99999999', number: '7', street: '' });
  });
});
