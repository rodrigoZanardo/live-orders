import type { OrderItem, StockProduct } from './types';

export type PickLine = OrderItem & { location: string | null };

/**
 * Picking list: each order line with its bin location, walked in location order.
 * Lines whose product has no location (or is unknown to the stock) go last, in order of the ticket.
 */
export function pickingList(
  items: readonly OrderItem[],
  products: readonly StockProduct[],
): PickLine[] {
  const locations = new Map(products.map((product) => [product.sku, product.location ?? null]));
  const lines = items.map((item) => ({ ...item, location: locations.get(item.sku) ?? null }));
  // stable sort: equal locations keep the order of the ticket
  return lines.sort((a, b) => {
    if (a.location === b.location) return 0;
    if (a.location === null) return 1;
    if (b.location === null) return -1;
    return a.location.localeCompare(b.location, 'en', { numeric: true });
  });
}
