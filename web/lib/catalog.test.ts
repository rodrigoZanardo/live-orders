import { exceedsLimit, maxQuantity, orderItems, parseQuantity } from './catalog';

// Staff view: the exact quantity is known.
const KEYBOARD = { sku: 'KB-001', name: 'Keyboard', inStock: true, quantity: 4 };
const WAREHOUSE = { sku: 'WH-003', name: 'Cable', inStock: true, quantity: 500 };
// Anonymous view: no quantity at all, only availability.
const PUBLIC_MOUSE = { sku: 'MS-002', name: 'Mouse', inStock: false };
const PUBLIC_CABLE = { sku: 'WH-003', name: 'Cable', inStock: true };

describe('parseQuantity', () => {
  it('accepts whole numbers above zero and treats everything else as none', () => {
    expect(parseQuantity('3')).toBe(3);
    expect(parseQuantity('')).toBe(0);
    expect(parseQuantity('0')).toBe(0);
    expect(parseQuantity('-2')).toBe(0);
    expect(parseQuantity('1.5')).toBe(0);
    expect(parseQuantity(undefined)).toBe(0);
  });
});

describe('limits', () => {
  it('caps staff quantities at the stock on hand and at the API limit of 99', () => {
    expect(maxQuantity(KEYBOARD)).toBe(4);
    expect(maxQuantity(WAREHOUSE)).toBe(99);
  });

  it('caps anonymous quantities at the API limit only, since the stock is not shown', () => {
    expect(maxQuantity(PUBLIC_CABLE)).toBe(99);
    expect(exceedsLimit(PUBLIC_CABLE, '99')).toBe(false);
    expect(exceedsLimit(PUBLIC_CABLE, '100')).toBe(true);
  });

  it('flags only quantities above the limit', () => {
    expect(exceedsLimit(KEYBOARD, '4')).toBe(false);
    expect(exceedsLimit(KEYBOARD, '5')).toBe(true);
    expect(exceedsLimit(KEYBOARD, undefined)).toBe(false);
  });
});

describe('orderItems', () => {
  it('returns the chosen products in product order and leaves out the rest', () => {
    const items = orderItems([KEYBOARD, PUBLIC_MOUSE, WAREHOUSE], {
      'WH-003': '2',
      'KB-001': '1',
      'MS-002': '',
    });
    expect(items).toEqual([
      { sku: 'KB-001', name: 'Keyboard', quantity: 1 },
      { sku: 'WH-003', name: 'Cable', quantity: 2 },
    ]);
  });

  it('returns no lines when nothing is chosen', () => {
    expect(orderItems([PUBLIC_CABLE], {})).toEqual([]);
  });
});
