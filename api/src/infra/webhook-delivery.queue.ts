import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import {
  DeliverWebhookUseCase,
  DeliveryQueue,
  WebhookSender,
  type DeliveryToSend,
} from '../application/outgoing-webhooks';
import { lookup } from 'dns/promises';
import { signWebhook } from '../domain/webhook-signature';
import { isPrivateAddress } from '../domain/webhook-subscription';
import { allowPrivateWebhookTargets } from '../env';

export const WEBHOOK_DELIVERIES_QUEUE = 'webhook-deliveries';
const SEND_TIMEOUT_MS = 10_000;

/**
 * Refuses a host that resolves to any private address now, even if it was public when the
 * subscription was created (DNS rebinding).
 * shortcut: fetch resolves the host again, so a sub-second rebind can still slip through; pin the
 * resolved address in a custom dispatcher if that matters.
 */
async function assertPublicHost(url: string): Promise<void> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(host, { all: true });
  if (addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error(`${host} resolves to a private address`);
  }
}

/** Signed POST with a timeout to a public host; anything but 2xx (a redirect too) counts as a failure. */
export class FetchWebhookSender extends WebhookSender {
  async send(delivery: DeliveryToSend): Promise<void> {
    if (!allowPrivateWebhookTargets()) await assertPublicHost(delivery.url);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const response = await fetch(delivery.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signWebhook(delivery.secret, timestamp, delivery.payload),
        'X-Timestamp': timestamp,
        'X-Delivery-Id': delivery.id,
        'X-Event-Seq': String(delivery.eventSeq),
      },
      body: delivery.payload,
      redirect: 'manual',
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  }
}

/**
 * BullMQ queue with one job per delivery. The first attempt runs at once; failures retry after
 * each of `retryDelaysMs`, and the last failure marks the delivery FAILED.
 */
@Injectable()
export class BullDeliveryQueue extends DeliveryQueue implements OnModuleDestroy {
  private readonly logger = new Logger(BullDeliveryQueue.name);
  private readonly connection: Redis;
  private readonly workerConnection: Redis;
  private readonly queue: Queue<{ deliveryId: string }>;
  private readonly worker: Worker<{ deliveryId: string }>;

  constructor(
    redisUrl: string,
    deliver: DeliverWebhookUseCase,
    private readonly retryDelaysMs: readonly number[],
  ) {
    super();
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.connection.on('error', (error: Error) => this.logger.warn(`Redis: ${error.message}`));
    this.workerConnection = this.connection.duplicate();
    this.queue = new Queue(WEBHOOK_DELIVERIES_QUEUE, { connection: this.connection });
    const attempts = retryDelaysMs.length + 1;
    this.worker = new Worker(
      WEBHOOK_DELIVERIES_QUEUE,
      async (job) => {
        const attempt = job.attemptsMade + 1;
        await deliver.execute(job.data.deliveryId, attempt, attempt >= attempts);
      },
      {
        connection: this.workerConnection,
        concurrency: 10,
        settings: {
          backoffStrategy: (attemptsMade: number) =>
            retryDelaysMs[Math.min(attemptsMade, retryDelaysMs.length) - 1] ?? 0,
        },
      },
    );
    this.worker.on('failed', (job, error) =>
      this.logger.warn(`Delivery ${job?.data.deliveryId ?? '?'} failed: ${error.message}`),
    );
  }

  async enqueue(deliveryIds: string[]): Promise<void> {
    try {
      await this.queue.addBulk(
        deliveryIds.map((deliveryId) => ({
          name: 'deliver',
          data: { deliveryId },
          opts: {
            jobId: deliveryId,
            attempts: this.retryDelaysMs.length + 1,
            backoff: { type: 'custom' },
            removeOnComplete: true,
            removeOnFail: 1000,
          },
        })),
      );
    } catch (error) {
      // the deliveries stay PENDING in the database and are visible to admins
      this.logger.warn(`Could not queue ${deliveryIds.length} deliveries: ${String(error)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    this.connection.disconnect();
    this.workerConnection.disconnect();
  }
}
