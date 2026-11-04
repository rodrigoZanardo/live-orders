import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';
import { LiveTickets } from '../application/live-tickets';

export const LIVE_TICKET_TTL_MS = 30_000;
const PREFIX = 'live-ticket:';

/** Tickets in Redis, so any API instance can accept a ticket another one issued. */
@Injectable()
export class RedisLiveTickets extends LiveTickets implements OnModuleDestroy {
  private readonly logger = new Logger(RedisLiveTickets.name);
  private readonly redis: Redis;

  constructor(
    url: string,
    private readonly ttlMs = LIVE_TICKET_TTL_MS,
  ) {
    super();
    // lazy: no connection until the first ticket, so tests that never open the board need no Redis
    this.redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    this.redis.on('error', (error: Error) => this.logger.warn(`Redis: ${error.message}`));
  }

  async issue(token: string): Promise<string> {
    const ticket = randomBytes(32).toString('base64url');
    const stored = await this.redis.set(PREFIX + ticket, token, 'PX', this.ttlMs, 'NX');
    if (stored !== 'OK') throw new Error('live ticket collision');
    return ticket;
  }

  async consume(ticket: string): Promise<string | null> {
    // GETDEL is atomic: two sockets racing with the same ticket cannot both get it
    return this.redis.getdel(PREFIX + ticket);
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }
}
