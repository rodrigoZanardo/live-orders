export const ORDER_STATUSES = ['RECEIVED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed moves. Cancelling is only possible before READY; DELIVERED and CANCELLED are final. */
const ALLOWED_MOVES: Record<OrderStatus, readonly OrderStatus[]> = {
  RECEIVED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function canMove(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_MOVES[from].includes(to);
}
