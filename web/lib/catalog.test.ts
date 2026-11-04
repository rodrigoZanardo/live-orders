import { filterProducts, maxQuantity, orderItems, setQuantity } from './catalog';

// Staff view: the exact quantity is known.
const KEYBOARD = { sku: 'KB-001', name: 'Keyboard', inStock: true, quantity: 4 };
const WAREHOUSE = { sku: 'WH-003', name: 'Cable', inStock: true, quantity: 500 };
// Anonymous view: no quantity at all, only availability.
const PUBLIC_MOUSE = { sku: 'MS-002', name: 'Mouse', inStock: false };
const PUBLIC_CABLE = { sku: 'WH-003', name: 'Cable', inStock: true };

describe('maxQuantity', () => {
  it('caps staff quantities at the stock on hand and at the API limit of 99', () => {
    expect(maxQuantity(KEYBOARD)).toBe(4);
    expect(maxQuantity(WAREHOUSE)).toBe(99);
  });

  it('caps anonymous quantities at the API limit only, since the stock is not shown', () => {
    expect(maxQuantity(PUBLIC_CABLE)).toBe(99);
  });
});

describe('setQuantity', () => {
  it('adds, changes and removes a product', () => {
    let cart = setQuantity({}, KEYBOARD, 1);
    expect(cart).toEqual({ 'KB-001': 1 });
    cart = setQuantity(cart, KEYBOARD, 3);
    expect(cart).toEqual({ 'KB-001': 3 });
    expect(setQuantity(cart, KEYBOARD, 0)).toEqual({});
  });

  it('keeps the quantity between zero and the limit', () => {
    expect(setQuantity({}, KEYBOARD, 9)).toEqual({ 'KB-001': 4 });
    expect(setQuantity({}, PUBLIC_CABLE, 150)).toEqual({ 'WH-003': 99 });
    expect(setQuantity({ 'KB-001': 2 }, KEYBOARD, -1)).toEqual({});
    expect(setQuantity({}, KEYBOARD, Number.NaN)).toEqual({});
  });

  it('never adds a product that is out of stock', () => {
    expect(setQuantity({}, PUBLIC_MOUSE, 1)).toEqual({});
  });
});

describe('filterProducts', () => {
  it('matches name or SKU, ignoring case and accents', () => {
    const products = [KEYBOARD, { sku: 'TP-1', name: 'Tampão', inStock: true }];
    expect(filterProducts(products, 'TAMPAO')).toHaveLength(1);
    expect(filterProducts(products, 'kb-0')).toEqual([KEYBOARD]);
    expect(filterProducts(products, '  ')).toHaveLength(2);
  });
});

describe('orderItems', () => {
  it('returns the cart lines in product order and leaves out the rest', () => {
    const items = orderItems([KEYBOARD, PUBLIC_MOUSE, WAREHOUSE], { 'WH-003': 2, 'KB-001': 1 });
    expect(items).toEqual([
      { sku: 'KB-001', name: 'Keyboard', quantity: 1 },
      { sku: 'WH-003', name: 'Cable', quantity: 2 },
    ]);
  });

  it('returns no lines for an empty cart', () => {
    expect(orderItems([PUBLIC_CABLE], {})).toEqual([]);
  });
});
