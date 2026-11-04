import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { WebSocket } from 'ws';
import { AppModule } from '../src/app.module';
import { TokenService, UserRepository } from '../src/application/auth.ports';
import { LateOrderTimer } from '../src/application/late-orders';
import { CleanupQueue } from '../src/infra/cleanup.queue';
import { configureApp } from '../src/http/configure-app';
import { PrismaService } from '../src/infra/prisma.service';
import { EventBus, InProcessEventBus } from '../src/realtime/event-bus';
import { CLOSE_UNAUTHORIZED } from '../src/realtime/live.gateway';
import { FakeTokenService, InMemoryUserRepository, NoLateTimer } from './fakes';

// The WebSocket endpoint on a real database (skipped without DATABASE_URL); Redis is replaced by an in-process bus.
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

type Message = { type: string; seq?: number; lastSeq?: number; event?: { order: { id: string } } };

/** Collects every message of a socket so a test can wait for the n-th one. */
function listen(socket: WebSocket) {
  const messages: Message[] = [];
  const waiters: (() => void)[] = [];
  socket.on('message', (data) => {
    messages.push(JSON.parse(String(data)));
    waiters.splice(0).forEach((wake) => wake());
  });
  return async (count: number): Promise<Message[]> => {
    while (messages.length < count) {
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
    return messages;
  };
}

describeWithDatabase('live WebSocket', () => {
  let app: INestApplication;
  let url: string;
  const tokens = new FakeTokenService();
  let token: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'admin-password';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CleanupQueue)
      .useValue({})
      .overrideProvider(LateOrderTimer)
      .useValue(new NoLateTimer())
      .overrideProvider(EventBus)
      .useValue(new InProcessEventBus())
      .overrideProvider(UserRepository)
      .useValue(new InMemoryUserRepository())
      .overrideProvider(TokenService)
      .useValue(tokens)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0);
    const address: AddressInfo | string | null = app.getHttpServer().address();
    if (!address || typeof address === 'string')
      throw new Error('server is not listening on a port');
    url = `ws://127.0.0.1:${address.port}/live`;
    token = await tokens.issue({ id: 'u1', email: 'staff@example.com', role: 'STAFF' });

    const db = app.get(PrismaService);
    await db.event.deleteMany();
    await db.order.deleteMany();
  });

  afterAll(() => app.close());

  it('closes a connection without a valid token with 4401', async () => {
    const socket = new WebSocket(`${url}?token=forged`);
    const code = await new Promise<number>((resolve) => socket.on('close', resolve));
    expect(code).toBe(CLOSE_UNAUTHORIZED);
  });

  it('says hello with the last seq, then pushes each new event to every open board', async () => {
    const boards = [new WebSocket(`${url}?token=${token}`), new WebSocket(`${url}?token=${token}`)];
    const received = boards.map(listen);
    const [hello] = await received[0](1);
    await received[1](1);
    expect(hello).toEqual({ type: 'hello', lastSeq: 0 });

    const created = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerName: 'Ana', items: [{ sku: 'BRG-01', name: 'Burger', quantity: 1 }] });

    for (const wait of received) {
      const [, event] = await wait(2);
      expect(event).toMatchObject({
        type: 'event',
        seq: created.body.seq,
        event: { order: { id: created.body.order.id } },
      });
    }
    boards.forEach((socket) => socket.close());
  });
});
