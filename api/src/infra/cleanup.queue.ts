import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { RequeueStaleDeliveriesUseCase } from '../application/outgoing-webhooks';
import { CleanupIdempotencyKeysUseCase } from '../application/platform-orders';

export const CLEANUP_QUEUE = 'cleanup';

/** Repeatable BullMQ jobs: old idempotency keys daily (03:00 server time); stale PENDING webhook deliveries every minute. */
@Injectable()
export class CleanupQueue implements OnModuleDestroy {
  private readonly logger = new Logger(CleanupQueue.name);
  private readonly connection: Redis;
  private readonly workerConnection: Redis;
  private readonly queue: Queue;
  private readonly worker: Worker;

  constructor(
    redisUrl: string,
    cleanup: CleanupIdempotencyKeysUseCase,
    requeue: RequeueStaleDeliveriesUseCase,
  ) {
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.connection.on('error', (error: Error) => this.logger.warn(`Redis: ${error.message}`));
    this.workerConnection = this.connection.duplicate();
    this.queue = new Queue(CLEANUP_QUEUE, { connection: this.connection });
    this.worker = new Worker(
      CLEANUP_QUEUE,
      async (job) => {
        if (job.name === 'stale-deliveries') {
          const count = await requeue.execute();
          if (count > 0) this.logger.log(`Re-queued ${count} stale webhook deliveries`);
          return;
        }
        const deleted = await cleanup.execute();
        this.logger.log(`Deleted ${deleted} old idempotency keys`);
      },
      { connection: this.workerConnection },
    );
    void this.queue
      .upsertJobScheduler('daily', { pattern: '0 3 * * *' }, { name: 'idempotency-keys' })
      .then(() =>
        this.queue.upsertJobScheduler(
          'stale-deliveries',
          { every: 60_000 },
          { name: 'stale-deliveries' },
        ),
      )
      .catch((error: Error) => this.logger.warn(`Could not schedule cleanup: ${error.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    this.connection.disconnect();
    this.workerConnection.disconnect();
  }
}
