import type { EventWithOrder } from './types';

export type ConnectionState = 'live' | 'reconnecting' | 'offline';

/** Waits before each reconnect attempt (PLAN.md section 5); the last value repeats. */
export const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000] as const;

export function reconnectDelay(attempt: number): number {
  return RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)] ?? 10000;
}

/** A message from /live, checked at runtime: anything unexpected is ignored, never trusted. */
export type LiveMessage =
  { type: 'hello'; lastSeq: number } | { type: 'event'; seq: number; event: EventWithOrder };

export function parseLiveMessage(data: string): LiveMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) return null;
  if (parsed.type === 'hello' && 'lastSeq' in parsed && typeof parsed.lastSeq === 'number') {
    return { type: 'hello', lastSeq: parsed.lastSeq };
  }
  if (
    parsed.type === 'event' &&
    'seq' in parsed &&
    typeof parsed.seq === 'number' &&
    'event' in parsed &&
    isEventWithOrder(parsed.event)
  ) {
    return { type: 'event', seq: parsed.seq, event: parsed.event };
  }
  return null;
}

/** Light shape check of an event from our own API (seq, type and an order with id and version). */
export function isEventWithOrder(value: unknown): value is EventWithOrder {
  if (typeof value !== 'object' || value === null) return false;
  if (!('seq' in value) || typeof value.seq !== 'number') return false;
  if (!('order' in value) || typeof value.order !== 'object' || value.order === null) return false;
  const order = value.order;
  return (
    'id' in order &&
    typeof order.id === 'string' &&
    'version' in order &&
    typeof order.version === 'number'
  );
}
