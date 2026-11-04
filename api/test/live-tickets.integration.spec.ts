import { RedisLiveTickets } from '../src/infra/redis-live-tickets';

// Runs only with a real Redis (CI sets REDIS_URL).
const redisUrl = process.env.REDIS_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('RedisLiveTickets', () => {
  const tickets = new RedisLiveTickets(redisUrl ?? '', 200);

  afterAll(() => tickets.onModuleDestroy());

  it('issues a random base64url ticket that returns the token once', async () => {
    const ticket = await tickets.issue('session-token');
    expect(ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await tickets.consume(ticket)).toBe('session-token');
    expect(await tickets.consume(ticket)).toBeNull();
  });

  it('refuses an expired or unknown ticket', async () => {
    const ticket = await tickets.issue('session-token');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await tickets.consume(ticket)).toBeNull();
    expect(await tickets.consume('forged')).toBeNull();
  });
});
