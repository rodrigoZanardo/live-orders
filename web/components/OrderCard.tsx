'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { moveOrder } from '@/app/actions';
import { isLate } from '@/lib/board';
import { NEXT_MOVES, type ApiFailure, type Order, type OrderStatus } from '@/lib/types';
import { useErrorText } from './form';

/** The ticket's left edge carries its lane colour, so a moved ticket is recognisable at a glance. */
const STRIPE: Record<OrderStatus, string> = {
  RECEIVED: 'border-l-received',
  PREPARING: 'border-l-preparing',
  READY: 'border-l-ready',
  DELIVERED: 'border-l-delivered',
  CANCELLED: 'border-l-line',
};

/** Minutes since a moment, refreshed every 30 s. */
function useMinutesSince(iso: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

export function OrderCard({ order, canMove }: { order: Order; canMove: boolean }) {
  const t = useTranslations('board');
  const moves = useTranslations('moves');
  const errorText = useErrorText();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ApiFailure | null>(null);
  const minutes = useMinutesSince(order.statusChangedAt);
  const late = isLate(order);

  const move = (to: OrderStatus) =>
    start(async () => {
      setError(null);
      // the new state arrives through the WebSocket like on every other screen
      const result = await moveOrder(order.id, to, order.version);
      if (result.error) setError(result.error);
    });

  const channel =
    order.channel === 'DELIVERY_PLATFORM'
      ? t('platform')
      : order.delivery
        ? t('delivery')
        : t('counter');

  return (
    <article
      className={`ticket-enter rounded-lg border border-l-[6px] bg-panel p-3 ${
        late ? 'border-danger ring-2 ring-danger/40' : `border-line ${STRIPE[order.status]}`
      }`}
    >
      <header className="flex items-start justify-between gap-2">
        <Link
          href={`/orders/${order.id}`}
          className="font-display text-4xl leading-none font-extrabold tabular-nums text-ink hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
          aria-label={t('details', { number: order.number })}
        >
          #{order.number}
        </Link>
        <div className="flex flex-wrap justify-end gap-1">
          {late && <span className="badge bg-danger text-white">⚠ {t('late')}</span>}
          <span className="badge bg-info-subtle text-info">{channel}</span>
        </div>
      </header>
      <p className="mt-1 truncate font-semibold">{order.customerName}</p>
      <ul className="mt-2 space-y-0.5 text-sm text-muted">
        {order.items.map((item, index) => (
          <li key={`${item.sku}-${index}`}>
            <span className="font-semibold tabular-nums text-ink">{item.quantity}×</span>{' '}
            {item.name}
          </li>
        ))}
      </ul>
      <p className={`mt-2 text-xs ${late ? 'font-semibold text-danger' : 'text-muted'}`}>
        {minutes === 0 ? t('justNow') : t('since', { minutes })}
      </p>

      {canMove && NEXT_MOVES[order.status].length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {NEXT_MOVES[order.status].map((to) => (
            <button
              key={to}
              type="button"
              disabled={pending}
              onClick={() => move(to)}
              className={
                to === 'CANCELLED' ? 'btn-danger py-1 text-xs' : 'btn-primary py-1 text-xs'
              }
              aria-label={moves('moveLabel', { action: moves(to), number: order.number })}
            >
              {pending ? moves('moving') : moves(to)}
            </button>
          ))}
        </div>
      )}
      <div aria-live="polite">
        {error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {errorText(error)}
          </p>
        )}
      </div>
    </article>
  );
}
