import { AppError } from '../src/domain/errors';
import { StockClient } from '../src/infra/stock.client';

const BASE = 'http://stock.test';
const TOKEN = 'viewer-token';

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

  it('reads GET /products with the VIEWER token and keeps only the SKUs asked for', async () => {
    fetchMock.mockResolvedValue(
      Response.json([
        { sku: 'BRG-01', quantity: 7 },
        { sku: 'KB-001', quantity: 2 },
        { sku: 'OTHER', quantity: 9 },
      ]),
    );
    const found = await new StockClient(BASE, TOKEN).available(['BRG-01', 'KB-001', 'NOPE']);

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/products`,
      expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } }),
    );
    expect([...found]).toEqual([
      ['BRG-01', 7],
      ['KB-001', 2],
    ]);
  });

  it('asks nothing when there are no SKUs', async () => {
    expect((await new StockClient(BASE, TOKEN).available([])).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is STOCK_UNAVAILABLE without a URL or token, and asks nothing', async () => {
    expect(await codeOf(new StockClient('', TOKEN).available(['BRG-01']))).toBe(
      'STOCK_UNAVAILABLE',
    );
    expect(await codeOf(new StockClient(BASE, '').available(['BRG-01']))).toBe('STOCK_UNAVAILABLE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is STOCK_UNAVAILABLE when the stock refuses', async () => {
    fetchMock.mockResolvedValue(new Response('no', { status: 401 }));
    expect(await codeOf(new StockClient(BASE, TOKEN).available(['BRG-01']))).toBe(
      'STOCK_UNAVAILABLE',
    );
  });

  it('is STOCK_UNAVAILABLE when the stock cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    expect(await codeOf(new StockClient(BASE, TOKEN).available(['BRG-01']))).toBe(
      'STOCK_UNAVAILABLE',
    );
  });

  it('is STOCK_UNAVAILABLE when the body is not a product list', async () => {
    fetchMock.mockResolvedValue(Response.json({ products: [] }));
    expect(await codeOf(new StockClient(BASE, TOKEN).available(['BRG-01']))).toBe(
      'STOCK_UNAVAILABLE',
    );
  });
});
