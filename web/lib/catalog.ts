import type { OrderItem, ShopProduct } from './types';

/** The API accepts 1 to 99 of one item per order. */
const MAX_PER_ITEM = 99;

/** Quantities are kept as typed; anything that is not a whole number above zero counts as none. */
export function parseQuantity(typed: string | undefined): number {
  const value = Number(typed);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/** Most one customer may order: stock on hand when staff sees it, always capped at the API limit. */
export function maxQuantity(product: ShopProduct): number {
  return Math.min(product.quantity ?? MAX_PER_ITEM, MAX_PER_ITEM);
}

/** A hint only: the API checks stock and limits again on submit. */
export function exceedsLimit(product: ShopProduct, typed: string | undefined): boolean {
  return parseQuantity(typed) > maxQuantity(product);
}

/** Order lines for the chosen quantities, in product order; products with no quantity are left out. */
export function orderItems(
  products: ShopProduct[],
  typed: Record<string, string | undefined>,
): OrderItem[] {
  return products.flatMap((product) => {
    const quantity = parseQuantity(typed[product.sku]);
    return quantity > 0 ? [{ sku: product.sku, name: product.name, quantity }] : [];
  });
}
