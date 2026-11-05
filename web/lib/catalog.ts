import type { OrderItem, ShopProduct } from './types';

/** The API accepts 1 to 99 of one item per order. */
const MAX_PER_ITEM = 99;

/** Quantity of each product in the cart, by SKU. */
export type Cart = Record<string, number>;

/** Most one customer may order: stock on hand when staff sees it, always capped at the API limit. */
export function maxQuantity(product: ShopProduct): number {
  return Math.min(product.quantity ?? MAX_PER_ITEM, MAX_PER_ITEM);
}

/** The cart with this product set to `quantity`, kept between 0 (removed) and the limit. A hint only: the API checks again. */
export function setQuantity(cart: Cart, product: ShopProduct, quantity: number): Cart {
  const rest = Object.fromEntries(Object.entries(cart).filter(([sku]) => sku !== product.sku));
  const max = product.inStock ? maxQuantity(product) : 0;
  const clamped = Math.min(Math.max(Math.trunc(quantity) || 0, 0), max);
  return clamped > 0 ? { ...rest, [product.sku]: clamped } : rest;
}

/** Products whose name or SKU contains the search text, ignoring case and accents. */
export function filterProducts(products: ShopProduct[], search: string): ShopProduct[] {
  const plain = (text: string) =>
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  const wanted = plain(search.trim());
  return products.filter((product) => plain(`${product.name} ${product.sku}`).includes(wanted));
}

/** Order lines for the cart, in product order; products not in the cart are left out. */
export function orderItems(products: ShopProduct[], cart: Cart): OrderItem[] {
  return products.flatMap((product) => {
    const quantity = cart[product.sku] ?? 0;
    return quantity > 0
      ? [{ sku: product.sku, name: product.name, quantity, unitPrice: product.price }]
      : [];
  });
}

/** Ticket total in cents, or null when any line has no price (the API computes the real one). */
export function ticketTotal(items: readonly OrderItem[]): number | null {
  let total = 0;
  for (const { unitPrice, quantity } of items) {
    if (unitPrice === null || unitPrice === undefined) return null;
    total += unitPrice * quantity;
  }
  return total;
}
