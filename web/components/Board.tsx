'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { applyEvents, column, hasGap, initialBoard, type BoardState } from '@/lib/board';
import {
  isEventWithOrder,
  parseLiveMessage,
  reconnectDelay,
  type ConnectionState,
} from '@/lib/live-connection';
import type { EventWithOrder, Order, OrderStatus, Role } from '@/lib/types';
import { OrderCard } from './OrderCard';
import { useNewOrderAlert } from './useNewOrderAlert';

const COLUMNS: OrderStatus[] = ['RECEIVED', 'PREPARING', 'READY', 'DELIVERED'];
const CLOSE_UNAUTHORIZED = 4401;

/**
 * The one live client component: starts from the server's list, then applies WebSocket events by seq.
 * After a reconnect or a gap it calls GET /events?after=<lastSeq> before applying anything newer.
 */
export function Board({
  orders,
  lastSeq,
  token,
  apiUrl,
  role,
}: {
  orders: Order[];
  lastSeq: number;
  token: string;
  apiUrl: string;
  role: Role | null;
}) {
  const t = useTranslations('board');
  const status = useTranslations('status');
  const router = useRouter();
  const [board, setBoard] = useState<BoardState>(() => initialBoard(orders, lastSeq));
  const [connection, setConnection] = useState<ConnectionState>('reconnecting');
  const boardRef = useRef(board);
  const alert = useNewOrderAlert();
  const canMove = role === 'STAFF' || role === 'ADMIN';

  const apply = useCallback(
    (events: EventWithOrder[]) => {
      const before = boardRef.current;
      const next = applyEvents(before, events);
      boardRef.current = next;
      setBoard(next);
      const created = events.filter(
        (event) => event.type === 'ORDER_CREATED' && event.seq > before.lastSeq,
      );
      if (created.length > 0) alert.notify(created.length);
    },
    [alert],
  );

  const catchUp = useCallback(async () => {
    // pages of at most 500 events until the board has seen everything
    for (;;) {
      const response = await fetch(`${apiUrl}/events?after=${boardRef.current.lastSeq}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (response.status === 401) {
        router.push('/login');
        return;
      }
      if (!response.ok) throw new Error(`catch-up failed: ${response.status}`);
      const body: unknown = await response.json();
      const events = Array.isArray(body) ? body.filter(isEventWithOrder) : [];
      apply(events);
      if (events.length < 500) return;
    }
  }, [apiUrl, token, apply, router]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    // messages that arrive while a catch-up runs wait here, so nothing is applied out of order
    let catchingUp: Promise<void> = Promise.resolve();

    const runCatchUp = () => {
      catchingUp = catchingUp.then(catchUp).catch(() => socket?.close());
      return catchingUp;
    };

    const connect = () => {
      socket = new WebSocket(
        `${apiUrl.replace(/^http/, 'ws')}/live?token=${encodeURIComponent(token)}`,
      );
      socket.onmessage = (message) => {
        const parsed = parseLiveMessage(String(message.data));
        if (!parsed) return;
        if (parsed.type === 'hello') {
          attempt = 0;
          setConnection('live');
          if (parsed.lastSeq > boardRef.current.lastSeq) void runCatchUp();
          return;
        }
        void catchingUp.then(() => {
          if (hasGap(boardRef.current, parsed.seq)) void runCatchUp();
          else apply([parsed.event]);
        });
      };
      socket.onclose = (event) => {
        if (stopped) return;
        if (event.code === CLOSE_UNAUTHORIZED) {
          router.push('/login');
          return;
        }
        setConnection(attempt >= 2 ? 'offline' : 'reconnecting');
        timer = setTimeout(connect, reconnectDelay(attempt));
        attempt += 1;
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [apiUrl, token, apply, catchUp, router]);

  const cancelled = column(board, 'CANCELLED');

  return (
    <section aria-labelledby="board-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="board-title" className="page-title">
          {t('title')}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <ConnectionBadge state={connection} />
          <button
            type="button"
            className="btn-secondary py-1 text-xs"
            aria-pressed={alert.soundOn}
            onClick={alert.toggleSound}
            title={t('sound')}
          >
            {alert.soundOn ? t('soundOn') : t('soundOff')}
          </button>
        </div>
      </div>
      {!canMove && <p className="text-sm text-muted">{t('readOnly')}</p>}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {COLUMNS.map((columnStatus) => {
          const items = column(board, columnStatus);
          return (
            <section
              key={columnStatus}
              aria-labelledby={`col-${columnStatus}`}
              className="flex min-h-40 flex-col rounded-lg bg-panel-muted p-3"
            >
              <h2
                id={`col-${columnStatus}`}
                className="mb-3 flex items-center justify-between font-display text-lg font-bold"
              >
                {status(columnStatus)}
                <span className="badge bg-panel font-mono text-muted">{items.length}</span>
              </h2>
              <ul className="flex flex-col gap-3">
                {items.map((order) => (
                  <li key={order.id}>
                    <OrderCard order={order} canMove={canMove} />
                  </li>
                ))}
              </ul>
              {items.length === 0 && <p className="m-auto text-sm text-muted">{t('empty')}</p>}
            </section>
          );
        })}
      </div>

      <details className="panel p-3">
        <summary className="cursor-pointer font-semibold">
          {t('cancelled', { count: cancelled.length })}
        </summary>
        <ul className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
          {cancelled.map((order) => (
            <li key={order.id}>
              <OrderCard order={order} canMove={false} />
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function ConnectionBadge({ state }: { state: ConnectionState }) {
  const t = useTranslations('board.connection');
  const styles: Record<ConnectionState, string> = {
    live: 'bg-success-subtle text-success',
    reconnecting: 'bg-warning-subtle text-warning',
    offline: 'bg-danger-subtle text-danger',
  };
  return (
    <span role="status" className={`badge ${styles[state]}`}>
      <span
        className={`size-2 rounded-full bg-current ${state === 'live' ? 'animate-pulse' : ''}`}
        aria-hidden
      />
      {t(state)}
    </span>
  );
}
