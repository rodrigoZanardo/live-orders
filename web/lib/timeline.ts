import type { OrderStatus } from './types';

/** The path an order walks; CANCELLED leaves it. */
const PATH = ['RECEIVED', 'PREPARING', 'READY', 'DELIVERED'] as const;

export type Step = { status: OrderStatus; state: 'done' | 'current' | 'todo' };

/** Steps for the customer's timeline; a cancelled order shows only RECEIVED and CANCELLED. */
export function statusSteps(status: OrderStatus): Step[] {
  if (status === 'CANCELLED')
    return [
      { status: 'RECEIVED', state: 'done' },
      { status: 'CANCELLED', state: 'current' },
    ];
  const at = PATH.findIndex((step) => step === status);
  return PATH.map((step, index) => ({
    status: step,
    state: index < at ? 'done' : index === at ? 'current' : 'todo',
  }));
}

/** Customers' page keeps asking for news while any order can still move. */
export function isOpen(status: OrderStatus): boolean {
  return status !== 'DELIVERED' && status !== 'CANCELLED';
}
