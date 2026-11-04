import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { WebSocket } from 'ws';
import { AppModule } from '../src/app.module';
import { TokenService, UserRepository } from '../src/application/auth.ports';
import { LateOrderTimer } from '../src/application/late-orders';
import { DeliveryQueue } from '../src/application/outgoing-webhooks';
import { LiveTickets } from '../src/application/live-tickets';
import { StockAvailability } from '../src/application/stock-availability';
import { FakeStockAvailability } from './fake-stock';
import { CleanupQueue } from '../src/infra/cleanup.queue';
import { configureApp } from '../src/http/configure-app';
import { PrismaService } from '../src/infra/prisma.service';
import { EventBus, InProcessEventBus } from '../src/realtime/event-bus';
import { CLOSE_UNAUTHORIZED } from '../src/realtime/live.gateway';
import {
  FakeTokenService,
  InMemoryLiveTickets,
  InMemoryUserRepository,
  NoDeliveryQueue,
  NoLateTimer,
} from './fakes';

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
  const tickets = new InMemoryLiveTickets();
  let token: string;

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
      .overrideProvider(UserRepository)
      .useValue(new InMemoryUserRepository())
      .overrideProvider(TokenService)
      .useValue(tokens)
      .overrideProvider(LiveTickets)
      .useValue(tickets)
      .overrideProvider(StockAvailability)
      .useValue(new FakeStockAvailability())
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

  const closeCode = (socket: WebSocket) =>
    new Promise<number>((resolve) => socket.on('close', resolve));
  const withTicket = async () => new WebSocket(`${url}?ticket=${await tickets.issue(token)}`);

  it('closes a connection with an unknown ticket, or with the old ?token=, with 4401', async () => {
    expect(await closeCode(new WebSocket(`${url}?ticket=forged`))).toBe(CLOSE_UNAUTHORIZED);
    expect(await closeCode(new WebSocket(`${url}?token=${token}`))).toBe(CLOSE_UNAUTHORIZED);
  });

  it('accepts a ticket once', async () => {
    const ticket = await tickets.issue(token);
    const first = new WebSocket(`${url}?ticket=${ticket}`);
    expect(await listen(first)(1)).toEqual([{ type: 'hello', lastSeq: 0 }]);
    expect(await closeCode(new WebSocket(`${url}?ticket=${ticket}`))).toBe(CLOSE_UNAUTHORIZED);
    first.close();
  });

  it('says hello with the last seq, then pushes each new event to every open board', async () => {
    const boards = [await withTicket(), await withTicket()];
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
