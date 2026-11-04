import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { LateOrderTimer, MarkLateUseCase } from '../application/late-orders';

export const LATE_ORDERS_QUEUE = 'late-orders';

type LateJob = { orderId: string; version: number };

/** Delayed BullMQ jobs: one per (order, version) entering PREPARING; the worker runs MarkLateUseCase. */
@Injectable()
export class BullLateOrderTimer extends LateOrderTimer implements OnModuleDestroy {
  private readonly logger = new Logger(BullLateOrderTimer.name);
  private readonly connection: Redis;
  private readonly workerConnection: Redis;
  private readonly queue: Queue<LateJob>;
  private readonly worker: Worker<LateJob>;

  constructor(
    redisUrl: string,
    private readonly delayMs: number,
    markLate: MarkLateUseCase,
  ) {
    super();
    // BullMQ workers need maxRetriesPerRequest: null to block on Redis
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.connection.on('error', (error: Error) => this.logger.warn(`Redis: ${error.message}`));
    this.workerConnection = this.connection.duplicate();
    this.queue = new Queue<LateJob>(LATE_ORDERS_QUEUE, { connection: this.connection });
    this.worker = new Worker<LateJob>(
      LATE_ORDERS_QUEUE,
      async (job) => {
        await markLate.execute(job.data.orderId, job.data.version);
      },
      { connection: this.workerConnection },
    );
    this.worker.on('failed', (job, error) =>
      this.logger.warn(`Late check ${job?.id ?? '?'} failed: ${error.message}`),
    );
  }

  async start(orderId: string, version: number): Promise<void> {
    try {
      // jobId makes a retried request schedule the same check only once
      await this.queue.add(
        'check',
        { orderId, version },
        {
          delay: this.delayMs,
          jobId: `${orderId}-${version}`,
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    } catch (error) {
      // the move is already committed; without Redis the order is simply never flagged late
      this.logger.warn(`Could not start the late timer for ${orderId}: ${String(error)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    this.connection.disconnect();
    this.workerConnection.disconnect();
  }
}
