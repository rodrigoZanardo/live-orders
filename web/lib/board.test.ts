import { applyEvents, canDrop, column, hasGap, initialBoard, isLate } from './board';
import type { EventWithOrder, Order, OrderStatus } from './types';

function order(id: string, status: OrderStatus, version: number, number = 1): Order {
  return {
    id,
    number,
    customerName: 'Ana',
    channel: 'COUNTER',
    items: [{ sku: 'BRG-01', name: 'Burger', quantity: 1 }],
    total: null,
    paymentMethod: null,
    changeFor: null,
    delivery: null,
    status,
    version,
    statusChangedAt: '2026-11-03T12:00:00Z',
    lateSince: null,
    externalId: null,
    createdAt: '2026-11-03T12:00:00Z',
  };
}

function event(seq: number, snapshot: Order): EventWithOrder {
  return {
    seq,
    type: snapshot.version === 1 ? 'ORDER_CREATED' : 'ORDER_STATUS_CHANGED',
    orderId: snapshot.id,
    fromStatus: null,
    toStatus: snapshot.status,
    version: snapshot.version,
    actorEmail: 'staff@example.com',
    createdAt: '2026-11-03T12:00:00Z',
    order: snapshot,
  };
}

describe('board reducer', () => {
  it('adds new orders and moves existing ones, tracking the last seq', () => {
    const start = initialBoard([order('a', 'RECEIVED', 1)], 10);
    const next = applyEvents(start, [
      event(11, order('a', 'PREPARING', 2)),
      event(12, order('b', 'RECEIVED', 1, 2)),
    ]);

    expect(next.lastSeq).toBe(12);
    expect(column(next, 'PREPARING').map((o) => o.id)).toEqual(['a']);
    expect(column(next, 'RECEIVED').map((o) => o.id)).toEqual(['b']);
  });

  it('ignores duplicates and events already applied', () => {
    const start = applyEvents(initialBoard([], 0), [event(1, order('a', 'RECEIVED', 1))]);
    expect(applyEvents(start, [event(1, order('a', 'RECEIVED', 1))])).toBe(start);
  });

  it('applies a batch in seq order even when it arrives shuffled', () => {
    const next = applyEvents(initialBoard([], 0), [
      event(3, order('a', 'READY', 3)),
      event(1, order('a', 'RECEIVED', 1)),
      event(2, order('a', 'PREPARING', 2)),
    ]);
    expect(next.orders.a?.status).toBe('READY');
    expect(next.lastSeq).toBe(3);
  });

  it('never replaces an order with an older version', () => {
    // catch-up events carry the current order, so an old event may hold a newer snapshot than a later one
    const start = initialBoard([order('a', 'READY', 3)], 5);
    const next = applyEvents(start, [event(6, order('a', 'PREPARING', 2))]);
    expect(next.orders.a?.status).toBe('READY');
    expect(next.lastSeq).toBe(6);
  });

  it('detects a gap in seqs', () => {
    const state = initialBoard([], 4);
    expect(hasGap(state, 5)).toBe(false);
    expect(hasGap(state, 7)).toBe(true);
  });

  it('allows a drop only on a next move of the card', () => {
    expect(canDrop('RECEIVED', 'PREPARING')).toBe(true);
    expect(canDrop('RECEIVED', 'READY')).toBe(false);
    expect(canDrop('PREPARING', 'PREPARING')).toBe(false);
    expect(canDrop('DELIVERED', 'RECEIVED')).toBe(false);
  });

  it('marks only PREPARING orders with lateSince as late', () => {
    expect(isLate({ ...order('a', 'PREPARING', 2), lateSince: '2026-11-03T12:10:00Z' })).toBe(true);
    expect(isLate({ ...order('a', 'READY', 3), lateSince: '2026-11-03T12:10:00Z' })).toBe(false);
  });
});
