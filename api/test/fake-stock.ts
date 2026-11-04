import { StockAvailability } from '../src/application/stock-availability';

/** Stock with plenty of every SKU, for tests that are not about stock. */
export class FakeStockAvailability extends StockAvailability {
  async available(skus: string[]): Promise<Map<string, number>> {
    return new Map(skus.map((sku) => [sku, 1000]));
  }
}
