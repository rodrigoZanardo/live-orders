import { FetchWebhookSender } from '../src/infra/webhook-delivery.queue';

// Delivery-time SSRF guard: the URL was checked when saved, but a hostname can point elsewhere later.
describe('FetchWebhookSender', () => {
  const saved = process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS;
  let fetchMock: jest.SpyInstance;
  const delivery = (url: string) => ({
    id: 'd1',
    url,
    secret: 's',
    payload: '{}',
    eventSeq: 1,
  });

  beforeEach(() => {
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 200 }));
  });
  afterEach(() => {
    fetchMock.mockRestore();
    process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS = saved;
  });

  it('refuses a host that resolves to a private address and sends nothing', async () => {
    delete process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS;
    await expect(
      new FetchWebhookSender().send(delivery('http://localhost:1/hook')),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends without following redirects', async () => {
    process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS = 'true';
    await new FetchWebhookSender().send(delivery('http://localhost:1/hook'));
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:1/hook',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });
});
