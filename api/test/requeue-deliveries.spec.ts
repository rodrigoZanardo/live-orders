import {
  RequeueStaleDeliveriesUseCase,
  WebhookRepository,
} from '../src/application/outgoing-webhooks';
import { NoDeliveryQueue } from './fakes';

const unused = () => Promise.reject(new Error('not used'));

describe('RequeueStaleDeliveriesUseCase', () => {
  const now = new Date('2026-11-03T12:00:00Z');

  function setup(stale: string[]) {
    const asked: Date[] = [];
    class FakeRepository extends WebhookRepository {
      async findStalePending(before: Date) {
        asked.push(before);
        return stale;
      }
      createSubscription = unused;
      listSubscriptions = unused;
      deleteSubscription = unused;
      createDeliveries = unused;
      findToSend = unused;
      markSent = unused;
      markAttemptFailed = unused;
      listDeliveries = unused;
    }
    const queue = new NoDeliveryQueue();
    const useCase = new RequeueStaleDeliveriesUseCase(new FakeRepository(), queue);
    return { asked, queue, useCase };
  }

  it('re-queues deliveries idle for over 2 minutes', async () => {
    const { asked, queue, useCase } = setup(['d1', 'd2']);
    expect(await useCase.execute(now)).toBe(2);
    expect(queue.queued).toEqual(['d1', 'd2']);
    expect(asked[0]).toEqual(new Date('2026-11-03T11:58:00Z'));
  });

  it('queues nothing when nothing is stale', async () => {
    const { queue, useCase } = setup([]);
    expect(await useCase.execute(now)).toBe(0);
    expect(queue.queued).toEqual([]);
  });
});
