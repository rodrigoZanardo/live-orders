import { AppError } from '../src/domain/errors';
import { Order, type CreateOrderInput, type OrderItem } from '../src/domain/order';
import { ORDER_STATUSES, type OrderStatus } from '../src/domain/order-status';

const now = new Date('2026-11-03T12:00:00Z');
const later = new Date('2026-11-03T12:05:00Z');
const burger: OrderItem = { sku: 'BRG-01', name: 'Burger', quantity: 1 };

function counterOrder(overrides: Partial<CreateOrderInput> = {}): Order {
  return Order.create({
    id: 'o1',
    number: 7,
    customerName: 'Ana',
    channel: 'COUNTER',
    items: [burger],
    now,
    ...overrides,
  });
}

function orderIn(status: OrderStatus): Order {
  return Order.restore({
    id: 'o1',
    number: 7,
    customerName: 'Ana',
    channel: 'COUNTER',
    items: [burger],
    delivery: null,
    status,
    version: 3,
    statusChangedAt: now,
    externalId: null,
    createdAt: now,
  });
}

function errorOf(fn: () => void): AppError | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  return undefined;
}

describe('Order.create', () => {
  it('starts as RECEIVED at version 1 with trimmed and normalized fields', () => {
    const order = counterOrder({
      customerName: '  Ana  ',
      items: [{ sku: ' brg-01 ', name: ' Burger ', quantity: 2 }],
    });

    expect(order.status).toBe('RECEIVED');
    expect(order.version).toBe(1);
    expect(order.statusChangedAt).toEqual(now);
    expect(order.customerName).toBe('Ana');
    expect(order.items).toEqual([{ sku: 'BRG-01', name: 'Burger', quantity: 2 }]);
    expect(order.delivery).toBeNull();
    expect(order.externalId).toBeNull();
  });

  it.each(['', '   ', 'x'.repeat(81)])('refuses the customer name %p', (customerName) => {
    expect(errorOf(() => counterOrder({ customerName }))?.code).toBe('CUSTOMER_NAME_INVALID');
  });

  it('accepts a customer name of exactly 80 characters', () => {
    expect(counterOrder({ customerName: 'x'.repeat(80) }).customerName).toHaveLength(80);
  });

  it.each<[string, OrderItem[]]>([
    ['no items', []],
    ['31 items', Array.from({ length: 31 }, () => burger)],
    ['a blank SKU', [{ ...burger, sku: ' ' }]],
    ['a blank name', [{ ...burger, name: '' }]],
    ['quantity 0', [{ ...burger, quantity: 0 }]],
    ['quantity 100', [{ ...burger, quantity: 100 }]],
    ['a fractional quantity', [{ ...burger, quantity: 1.5 }]],
  ])('refuses %s', (_, items) => {
    const error = errorOf(() => counterOrder({ items }));
    expect(error?.code).toBe('ITEMS_INVALID');
    expect(error?.params).toEqual({ maxItems: 30, maxQuantity: 99 });
  });

  it('accepts 30 items with quantity 99', () => {
    const items = Array.from({ length: 30 }, () => ({ ...burger, quantity: 99 }));
    expect(counterOrder({ items }).items).toHaveLength(30);
  });

  it('keeps a delivery address with the CEP as 8 digits', () => {
    const order = counterOrder({
      delivery: {
        cep: '01001-000',
        street: ' Praça da Sé ',
        number: '1',
        district: 'Sé',
        city: 'São Paulo',
        state: 'sp',
      },
    });
    expect(order.delivery).toEqual({
      cep: '01001000',
      street: 'Praça da Sé',
      number: '1',
      district: 'Sé',
      city: 'São Paulo',
      state: 'SP',
    });
  });

  it.each(['0100100', '010010000', 'abcde-fgh', 'x01001000'])('refuses the CEP %p', (cep) => {
    const delivery = { cep, street: '', number: '', district: '', city: '', state: '' };
    expect(errorOf(() => counterOrder({ delivery }))?.code).toBe('CEP_INVALID');
  });

  it('requires the external id for delivery platform orders', () => {
    const create = () => counterOrder({ channel: 'DELIVERY_PLATFORM', externalId: ' ' });
    expect(errorOf(create)?.code).toBe('EXTERNAL_ID_REQUIRED');

    const order = counterOrder({ channel: 'DELIVERY_PLATFORM', externalId: ' ifood-123 ' });
    expect(order.externalId).toBe('ifood-123');
  });
});

describe('Order.moveTo', () => {
  const allowed: [OrderStatus, OrderStatus][] = [
    ['RECEIVED', 'PREPARING'],
    ['RECEIVED', 'CANCELLED'],
    ['PREPARING', 'READY'],
    ['PREPARING', 'CANCELLED'],
    ['READY', 'DELIVERED'],
  ];
  const isAllowed = (from: OrderStatus, to: OrderStatus) =>
    allowed.some(([f, t]) => f === from && t === to);
  const allPairs = ORDER_STATUSES.flatMap((from) =>
    ORDER_STATUSES.map((to): [OrderStatus, OrderStatus] => [from, to]),
  );
  const refused = allPairs.filter(([from, to]) => !isAllowed(from, to));

  it.each(allowed)('moves %s -> %s, bumps the version and the status time', (from, to) => {
    const order = orderIn(from);
    order.moveTo(to, 3, later);

    expect(order.status).toBe(to);
    expect(order.version).toBe(4);
    expect(order.statusChangedAt).toEqual(later);
  });

  it.each(refused)('refuses %s -> %s and leaves the order unchanged', (from, to) => {
    const order = orderIn(from);
    const error = errorOf(() => order.moveTo(to, 3, later));

    expect(error?.code).toBe('STATUS_MOVE_INVALID');
    expect(error?.params).toEqual({ from, to });
    expect(error?.message).toBe(`An order cannot move from ${from} to ${to}.`);
    expect(order.status).toBe(from);
    expect(order.version).toBe(3);
    expect(order.statusChangedAt).toEqual(now);
  });

  it('refuses a move from an old version with ORDER_CHANGED', () => {
    const order = orderIn('RECEIVED');
    const error = errorOf(() => order.moveTo('PREPARING', 2, later));

    expect(error?.code).toBe('ORDER_CHANGED');
    expect(error?.kind).toBe('conflict');
    expect(order.status).toBe('RECEIVED');
  });
});
