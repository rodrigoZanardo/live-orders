// The module is server-only; in Jest it is an ordinary module.
jest.mock('server-only', () => ({}));

const PRODUCTS = [
  { sku: 'KB-001', name: 'Keyboard', quantity: 4, price: 15000 },
  { sku: 'MS-002', name: 'Mouse', quantity: 0 },
];

describe('listStockProducts', () => {
  const saved = { ...process.env };
  let fetchMock: jest.SpyInstance;
  let listStockProducts: typeof import('./stock').listStockProducts;

  beforeEach(async () => {
    process.env.STOCK_API_URL = 'http://stock.test/';
    process.env.STOCK_API_EMAIL = 'viewer@example.com';
    process.env.STOCK_API_PASSWORD = 'secret';
    // fresh module per test: the signed-in token is kept at module level
    jest.resetModules();
    ({ listStockProducts } = await import('./stock'));
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((url) =>
        Promise.resolve(
          String(url).endsWith('/auth/login')
            ? Response.json({ accessToken: 'service-token' })
            : new Response(JSON.stringify(PRODUCTS), { status: 200 }),
        ),
      );
  });

  afterEach(() => {
    fetchMock.mockRestore();
    process.env = { ...saved };
  });

  it('signs in as the viewer, reads /products with its token and returns the exact quantities for staff', async () => {
    await expect(listStockProducts(true)).resolves.toStrictEqual([
      { sku: 'KB-001', name: 'Keyboard', inStock: true, price: 15000, quantity: 4 },
      { sku: 'MS-002', name: 'Mouse', inStock: false, price: null, quantity: 0 },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://stock.test/products',
      expect.objectContaining({ headers: { Authorization: 'Bearer service-token' } }),
    );
  });

  it('uses available (stock minus reservations) when the stock sends it', async () => {
    fetchMock.mockImplementation((url) =>
      Promise.resolve(
        String(url).endsWith('/auth/login')
          ? Response.json({ accessToken: 'service-token' })
          : Response.json([
              { sku: 'KB-001', name: 'Keyboard', quantity: 4, available: 1 },
              { sku: 'MS-002', name: 'Mouse', quantity: 2, available: 0 },
            ]),
      ),
    );
    await expect(listStockProducts(true)).resolves.toStrictEqual([
      { sku: 'KB-001', name: 'Keyboard', inStock: true, price: null, quantity: 1 },
      { sku: 'MS-002', name: 'Mouse', inStock: false, price: null, quantity: 0 },
    ]);
  });

  it('returns availability only, never a quantity, for anonymous visitors', async () => {
    const result = await listStockProducts(false);
    expect(result).toStrictEqual([
      // the price is public; the quantity is not
      { sku: 'KB-001', name: 'Keyboard', inStock: true, price: 15000 },
      { sku: 'MS-002', name: 'Mouse', inStock: false, price: null },
    ]);
    expect(JSON.stringify(result)).not.toContain('quantity');
  });

  it('keeps the bin location in the raw rows but never in the catalog', async () => {
    fetchMock.mockImplementation((url) =>
      Promise.resolve(
        String(url).endsWith('/auth/login')
          ? Response.json({ accessToken: 'service-token' })
          : Response.json([{ sku: 'KB-001', name: 'Keyboard', quantity: 4, location: 'R01-B03' }]),
      ),
    );
    const { fetchStockProducts } = await import('./stock');
    expect((await fetchStockProducts())[0]?.location).toBe('R01-B03');
    for (const exact of [true, false]) {
      expect(JSON.stringify(await listStockProducts(exact))).not.toContain('R01-B03');
    }
  });

  it('fails with a clear message when the variables are missing, without calling the service', async () => {
    delete process.env.STOCK_API_PASSWORD;
    await expect(listStockProducts(false)).rejects.toThrow('STOCK_API_PASSWORD must be set');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs in again once when the token expired', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ accessToken: 'old' }))
      .mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(listStockProducts(false)).resolves.toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('fails when the sign-in is refused', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(listStockProducts(false)).rejects.toThrow('sign-in answered HTTP 401');
  });

  it('fails on a body that is not a product list', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ accessToken: 't' }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    await expect(listStockProducts(false)).rejects.toThrow('no product list');

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([{ sku: 'KB-001', name: 'Keyboard' }]), { status: 200 }),
    );
    await expect(listStockProducts(false)).rejects.toThrow('malformed product');
  });
});
