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

// kept between requests; renewed when the stock answers 401 (the token expires)
let token: string | undefined;

async function signIn(baseUrl: string, email: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body: unknown = response.ok ? await response.json() : undefined;
  if (
    typeof body === 'object' &&
    body !== null &&
    'accessToken' in body &&
    typeof body.accessToken === 'string'
  )
    return body.accessToken;
  throw new Error(`Stock sign-in answered HTTP ${response.status}.`);
}

function getProducts(baseUrl: string, bearer: string): Promise<Response> {
  return fetch(`${baseUrl}/products`, {
    headers: { Authorization: `Bearer ${bearer}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/**
 * Products from the stock service, signed in as its VIEWER user (server only).
 * The credentials have no NEXT_PUBLIC_ prefix, so they never reach the browser.
 * Without `exact` the quantity is dropped here, so it never reaches an anonymous page.
 */
export async function listStockProducts(exact: boolean): Promise<ShopProduct[]> {
  const baseUrl = process.env.STOCK_API_URL?.replace(/\/$/, '');
  const email = process.env.STOCK_API_EMAIL;
  const password = process.env.STOCK_API_PASSWORD;
  if (!baseUrl || !email || !password) {
    throw new Error(
      'STOCK_API_URL, STOCK_API_EMAIL and STOCK_API_PASSWORD must be set to read products (see .env.example).',
    );
  }

  token ??= await signIn(baseUrl, email, password);
  let response = await getProducts(baseUrl, token);
  if (response.status === 401) {
    token = await signIn(baseUrl, email, password);
    response = await getProducts(baseUrl, token);
  }
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
