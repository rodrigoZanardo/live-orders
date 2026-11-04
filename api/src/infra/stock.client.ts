import { Logger } from '@nestjs/common';
import { StockAvailability } from '../application/stock-availability';
import { AppError } from '../domain/errors';

export const STOCK_TIMEOUT_MS = 3000;

/**
 * GET /products of the stock service, with a VIEWER token (read only).
 * Any failure (timeout, refusal, unexpected body) is STOCK_UNAVAILABLE: an order is refused, never accepted unchecked.
 */
export class StockClient extends StockAvailability {
  private readonly logger = new Logger(StockClient.name);

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {
    super();
  }

  async available(skus: string[]): Promise<Map<string, number>> {
    if (skus.length === 0) {
      return new Map();
    }
    if (!this.baseUrl || !this.token) {
      this.logger.warn('STOCK_API_URL or STOCK_API_TOKEN is not set');
      throw new AppError('STOCK_UNAVAILABLE');
    }
    let body: unknown;
    try {
      const response = await fetch(`${this.baseUrl}/products`, {
        headers: { Authorization: `Bearer ${this.token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(STOCK_TIMEOUT_MS),
      });
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
    const found = new Map<string, number>();
    for (const product of body) {
      if (typeof product !== 'object' || product === null) continue;
      const sku = 'sku' in product ? product.sku : undefined;
      const quantity = 'quantity' in product ? product.quantity : undefined;
      if (typeof sku === 'string' && typeof quantity === 'number' && wanted.has(sku)) {
        found.set(sku, quantity);
      }
    }
    return found;
  }
}
