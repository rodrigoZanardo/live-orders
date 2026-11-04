import { AppError } from '../src/domain/errors';
import { StockClient } from '../src/infra/stock.client';

const BASE = 'http://stock.test';
const TOKEN = 'viewer-token';
const client = () => new StockClient(BASE, 'viewer@example.com', 'secret');
const signedIn = () => Response.json({ accessToken: TOKEN });

function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  return promise.then(
    () => undefined,
    (error: unknown) => {
      if (error instanceof AppError) return error.code;
      throw error;
    },
  );
}

describe('StockClient', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('signs in once, then reads GET /products with the VIEWER token and keeps only the SKUs asked for', async () => {
    fetchMock.mockResolvedValueOnce(signedIn()).mockImplementation(() =>
      Promise.resolve(
        Response.json([
          { sku: 'BRG-01', quantity: 7 },
          { sku: 'KB-001', quantity: 2 },
          { sku: 'OTHER', quantity: 9 },
        ]),
      ),
    );
    const stock = client();
    await stock.available(['BRG-01']);
    const found = await stock.available(['BRG-01', 'KB-001', 'NOPE']);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/auth/login`,
      expect.objectContaining({
        body: JSON.stringify({ email: 'viewer@example.com', password: 'secret' }),
      }),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${BASE}/products`,
      expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } }),
    );
    expect([...found]).toEqual([
      ['BRG-01', 7],
      ['KB-001', 2],
    ]);
  });

  it('asks nothing when there are no SKUs', async () => {
    expect((await client().available([])).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is STOCK_UNAVAILABLE without a URL or credentials, and asks nothing', async () => {
    expect(await codeOf(new StockClient('', 'a@b.c', 'x').available(['BRG-01']))).toBe(
      'STOCK_UNAVAILABLE',
    );
    expect(await codeOf(new StockClient(BASE, '', 'x').available(['BRG-01']))).toBe(
      'STOCK_UNAVAILABLE',
    );
    expect(await codeOf(new StockClient(BASE, 'a@b.c', '').available(['BRG-01']))).toBe(
      'STOCK_UNAVAILABLE',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs in again when the token expired (401) and retries once', async () => {
    fetchMock
      .mockResolvedValueOnce(signedIn())
      .mockResolvedValueOnce(new Response('expired', { status: 401 }))
      .mockResolvedValueOnce(signedIn())
      .mockResolvedValueOnce(Response.json([{ sku: 'BRG-01', quantity: 3 }]));
    expect([...(await client().available(['BRG-01']))]).toEqual([['BRG-01', 3]]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('is STOCK_UNAVAILABLE when the sign-in is refused', async () => {
    fetchMock.mockResolvedValue(new Response('no', { status: 401 }));
    expect(await codeOf(client().available(['BRG-01']))).toBe('STOCK_UNAVAILABLE');
  });

  it('is STOCK_UNAVAILABLE when the stock cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    expect(await codeOf(client().available(['BRG-01']))).toBe('STOCK_UNAVAILABLE');
  });

  it('is STOCK_UNAVAILABLE when the body is not a product list', async () => {
    fetchMock.mockResolvedValueOnce(signedIn()).mockResolvedValue(Response.json({ products: [] }));
    expect(await codeOf(client().available(['BRG-01']))).toBe('STOCK_UNAVAILABLE');
  });
});
