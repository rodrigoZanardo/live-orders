import { AppError } from '../src/domain/errors';
import { assertInStock } from '../src/domain/stock-check';

/** The error code thrown by fn, or undefined when it passes. */
function codeOf(fn: () => void): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
}

describe('assertInStock', () => {
  const available = new Map([
    ['BRG-01', { available: 5, name: 'Burger', price: null }],
    ['KB-001', { available: 2, name: 'Kit', price: 100 }],
  ]);

  it('accepts an order that fits the stock', () => {
    expect(
      codeOf(() => assertInStock([{ sku: 'BRG-01', quantity: 5 }], available)),
    ).toBeUndefined();
  });

  it('refuses a SKU the stock does not know', () => {
    expect(codeOf(() => assertInStock([{ sku: 'XXX-9', quantity: 1 }], available))).toBe(
      'SKU_NOT_IN_STOCK',
    );
  });

  it('refuses more than is available', () => {
    expect(codeOf(() => assertInStock([{ sku: 'KB-001', quantity: 3 }], available))).toBe(
      'STOCK_INSUFFICIENT',
    );
  });

  it('adds up repeated lines of the same SKU before comparing', () => {
    const items = [
      { sku: 'KB-001', quantity: 1 },
      { sku: 'KB-001', quantity: 2 },
    ];
    expect(codeOf(() => assertInStock(items, available))).toBe('STOCK_INSUFFICIENT');
  });
});
