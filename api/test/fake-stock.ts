import { StockAvailability } from '../src/application/stock-availability';
import type { StockProduct } from '../src/domain/stock-check';

/** Stock with plenty of every SKU, named "Stock <SKU>" and priced 1000 cents, for tests that are not about stock. */
export class FakeStockAvailability extends StockAvailability {
  async available(skus: string[]): Promise<Map<string, StockProduct>> {
    return new Map(
      skus.map((sku) => [sku, { available: 1000, name: `Stock ${sku}`, price: 1000 }]),
    );
  }
}
