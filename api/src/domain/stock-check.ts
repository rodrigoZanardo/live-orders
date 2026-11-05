import { AppError } from './errors';

/** What the stock knows of a product: units free to order, its name and sale price (cents, null when unset). */
export type StockProduct = { available: number; name: string; price: number | null };

/**
 * Counter orders: every SKU must be a product the stock knows, and each total must fit what is available.
 * `available` comes from the stock service; a SKU missing from it is not a product.
 */
export function assertInStock(
  items: readonly { sku: string; quantity: number }[],
  available: ReadonlyMap<string, StockProduct>,
): void {
  const wanted = new Map<string, number>();
  for (const { sku, quantity } of items) wanted.set(sku, (wanted.get(sku) ?? 0) + quantity);
  for (const [sku, quantity] of wanted) {
    const have = available.get(sku)?.available;
    if (have === undefined) throw new AppError('SKU_NOT_IN_STOCK', { sku });
    if (quantity > have) throw new AppError('STOCK_INSUFFICIENT', { sku, available: have });
  }
}
