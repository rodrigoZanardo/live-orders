import { Logger } from '@nestjs/common';
import { StockAvailability } from '../application/stock-availability';
import { AppError } from '../domain/errors';
import type { StockProduct } from '../domain/stock-check';

// shortcut: the free hosting plan takes up to ~40 s to wake the stock services; lower it on always-on hosting
export const STOCK_TIMEOUT_MS = 45_000;

/**
 * GET /products of the stock service as a VIEWER user (read only). Signs in with email and password,
 * keeps the token and signs in again when it expires (401), so no hand-made token goes stale.
 * Any failure (timeout, refusal, unexpected body) is STOCK_UNAVAILABLE: an order is refused, never accepted unchecked.
 */
export class StockClient extends StockAvailability {
  private readonly logger = new Logger(StockClient.name);

  private token: string | undefined;

  constructor(
    private readonly baseUrl: string,
    private readonly email: string,
    private readonly password: string,
  ) {
    super();
  }

  async available(skus: string[]): Promise<Map<string, StockProduct>> {
    if (skus.length === 0) {
      return new Map();
    }
    if (!this.baseUrl || !this.email || !this.password) {
      this.logger.warn('STOCK_API_URL, STOCK_API_EMAIL or STOCK_API_PASSWORD is not set');
      throw new AppError('STOCK_UNAVAILABLE');
    }
    let body: unknown;
    try {
      this.token ??= await this.signIn();
      let response = await this.products(this.token);
      if (response.status === 401) {
        this.token = await this.signIn();
        response = await this.products(this.token);
      }
      if (!response.ok) {
        this.logger.warn(`stock answered ${response.status}`);
        throw new AppError('STOCK_UNAVAILABLE');
      }
      body = await response.json();
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.warn(`stock unreachable: ${String(error)}`);
      throw new AppError('STOCK_UNAVAILABLE');
    }

    if (!Array.isArray(body)) {
      this.logger.warn('stock answered a body that is not a product list');
      throw new AppError('STOCK_UNAVAILABLE');
    }
    const wanted = new Set(skus);
    const found = new Map<string, StockProduct>();
    for (const product of body) {
      if (typeof product !== 'object' || product === null) continue;
      const sku = 'sku' in product ? product.sku : undefined;
      // `available` leaves out what other orders reserved; older stock versions only send `quantity`
      const quantity =
        'available' in product && typeof product.available === 'number'
          ? product.available
          : 'quantity' in product
            ? product.quantity
            : undefined;
      const name = 'name' in product && typeof product.name === 'string' ? product.name : sku;
      // `price` (cents) is new in Stock Manager; absent or not a number means no price yet
      const price = 'price' in product && typeof product.price === 'number' ? product.price : null;
      if (
        typeof sku === 'string' &&
        typeof name === 'string' &&
        typeof quantity === 'number' &&
        wanted.has(sku)
      ) {
        found.set(sku, { available: quantity, name, price });
      }
    }
    return found;
  }

  private products(token: string): Promise<Response> {
    return fetch(`${this.baseUrl}/products`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(STOCK_TIMEOUT_MS),
    });
  }

  private async signIn(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
      signal: AbortSignal.timeout(STOCK_TIMEOUT_MS),
    });
    const body: unknown = response.ok ? await response.json() : undefined;
    if (
      typeof body === 'object' &&
      body !== null &&
      'accessToken' in body &&
      typeof body.accessToken === 'string'
    ) {
      return body.accessToken;
    }
    this.logger.warn(`stock sign-in failed: ${response.status}`);
    throw new AppError('STOCK_UNAVAILABLE');
  }
}
