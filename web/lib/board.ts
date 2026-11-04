import { NEXT_MOVES, type EventWithOrder, type Order, type OrderStatus } from './types';

/** A card can be dropped on a lane only when that lane is one of its next moves; the API still checks the move. */
export function canDrop(from: OrderStatus, to: OrderStatus): boolean {
  return NEXT_MOVES[from].includes(to);
}

/** What the live board knows: every order by id, and the last event seq it applied. */
export type BoardState = { orders: Record<string, Order>; lastSeq: number };

export function initialBoard(orders: Order[], lastSeq: number): BoardState {
  return { orders: Object.fromEntries(orders.map((order) => [order.id, order])), lastSeq };
}

/**
 * Applies events in seq order and ignores the ones already applied, so a repeated or late message
 * never moves the board backwards. Each event carries its order's state, which replaces the old one
 * unless the board already holds a newer version.
 */
export function applyEvents(state: BoardState, events: EventWithOrder[]): BoardState {
  const fresh = events.filter((event) => event.seq > state.lastSeq).sort((a, b) => a.seq - b.seq);
  if (fresh.length === 0) {
    return state;
  }
  const orders = { ...state.orders };
  for (const event of fresh) {
    const known = orders[event.order.id];
    if (!known || known.version <= event.order.version) {
      orders[event.order.id] = event.order;
    }
  }
  return { orders, lastSeq: fresh[fresh.length - 1]?.seq ?? state.lastSeq };
}

/** True when an event skips seqs the board has not seen: the board must catch up first. */
export function hasGap(state: BoardState, seq: number): boolean {
  return seq > state.lastSeq + 1;
}

/** Orders of one column, oldest number first. */
export function column(state: BoardState, status: OrderStatus): Order[] {
  return Object.values(state.orders)
    .filter((order) => order.status === status)
    .sort((a, b) => a.number - b.number);
}

export function isLate(order: Order): boolean {
  return order.status === 'PREPARING' && order.lateSince !== null;
}
