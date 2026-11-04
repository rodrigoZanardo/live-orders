import 'server-only';
import type { ShopProduct, StockProduct } from './types';

const TIMEOUT_MS = 5000;

function isStockProduct(value: unknown): value is StockProduct {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sku' in value &&
    typeof value.sku === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'quantity' in value &&
    typeof value.quantity === 'number'
  );
}

/**
 * Products from the stock service, with the service token (server only).
 * The token has no NEXT_PUBLIC_ prefix, so it never reaches the browser.
 * Without `exact` the quantity is dropped here, so it never reaches an anonymous page.
 */
export async function listStockProducts(exact: boolean): Promise<ShopProduct[]> {
  const baseUrl = process.env.STOCK_API_URL;
  const token = process.env.STOCK_API_TOKEN;
  if (!baseUrl || !token) {
    throw new Error(
      'STOCK_API_URL and STOCK_API_TOKEN must be set to read products (see .env.example).',
    );
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/products`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok)
    throw new Error(`Stock service answered HTTP ${response.status} for /products.`);

  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error('Stock service returned no product list.');
  const products = body.filter(isStockProduct);
  if (products.length !== body.length)
    throw new Error('Stock service returned a malformed product.');
  return products.map(({ sku, name, quantity }) =>
    exact ? { sku, name, inStock: quantity > 0, quantity } : { sku, name, inStock: quantity > 0 },
  );
}
