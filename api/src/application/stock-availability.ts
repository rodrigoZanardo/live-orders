/**
 * Port: how many units the stock service has for each SKU. A SKU the stock does not know is absent from the map.
 * Throws AppError STOCK_UNAVAILABLE when the stock cannot be read; an order is never accepted without this check.
 */
export abstract class StockAvailability {
  abstract available(skus: string[]): Promise<Map<string, number>>;
}
