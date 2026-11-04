import { listStockProducts } from './stock';

// The module is server-only; in Jest it is an ordinary module.
jest.mock('server-only', () => ({}));

const PRODUCTS = [
  { sku: 'KB-001', name: 'Keyboard', quantity: 4 },
  { sku: 'MS-002', name: 'Mouse', quantity: 0 },
];

describe('listStockProducts', () => {
  const saved = { url: process.env.STOCK_API_URL, token: process.env.STOCK_API_TOKEN };
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env.STOCK_API_URL = 'http://stock.test/';
    process.env.STOCK_API_TOKEN = 'service-token';
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(PRODUCTS), { status: 200 }));
  });

  afterEach(() => {
    fetchMock.mockRestore();
    if (saved.url === undefined) delete process.env.STOCK_API_URL;
    else process.env.STOCK_API_URL = saved.url;
    if (saved.token === undefined) delete process.env.STOCK_API_TOKEN;
    else process.env.STOCK_API_TOKEN = saved.token;
  });

  it('reads /products with the service token and returns the exact quantities for staff', async () => {
    await expect(listStockProducts(true)).resolves.toStrictEqual([
      { sku: 'KB-001', name: 'Keyboard', inStock: true, quantity: 4 },
      { sku: 'MS-002', name: 'Mouse', inStock: false, quantity: 0 },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://stock.test/products',
      expect.objectContaining({ headers: { Authorization: 'Bearer service-token' } }),
    );
  });

  it('returns availability only, never a quantity, for anonymous visitors', async () => {
    const result = await listStockProducts(false);
    expect(result).toStrictEqual([
      { sku: 'KB-001', name: 'Keyboard', inStock: true },
      { sku: 'MS-002', name: 'Mouse', inStock: false },
    ]);
    expect(JSON.stringify(result)).not.toContain('quantity');
  });

  it('fails with a clear message when the variables are missing, without calling the service', async () => {
    delete process.env.STOCK_API_TOKEN;
    await expect(listStockProducts(false)).rejects.toThrow(
      'STOCK_API_URL and STOCK_API_TOKEN must be set',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails when the service refuses the token', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(listStockProducts(false)).rejects.toThrow('HTTP 401');
  });

  it('fails on a body that is not a product list', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    await expect(listStockProducts(false)).rejects.toThrow('no product list');

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ sku: 'KB-001', name: 'Keyboard' }]), { status: 200 }),
    );
    await expect(listStockProducts(false)).rejects.toThrow('malformed product');
  });
});
