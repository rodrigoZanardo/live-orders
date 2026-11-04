'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { catchUpEvents, liveTicket, moveOrder } from '@/app/actions';
import { applyEvents, canDrop, column, hasGap, initialBoard, type BoardState } from '@/lib/board';
import {
  isEventWithOrder,
  parseLiveMessage,
  reconnectDelay,
  type ConnectionState,
} from '@/lib/live-connection';
import type { ApiFailure, EventWithOrder, Order, OrderStatus, Role } from '@/lib/types';
import { useErrorText } from './form';
import { OrderCard } from './OrderCard';
import { useNewOrderAlert } from './useNewOrderAlert';

const COLUMNS: OrderStatus[] = ['RECEIVED', 'PREPARING', 'READY', 'DELIVERED'];

/** One signal colour per lane, shared by the lane header and its tickets. */
const LANE_COLOR: Record<OrderStatus, string> = {
  RECEIVED: 'border-received text-received',
  PREPARING: 'border-preparing text-preparing',
  READY: 'border-ready text-ready',
  DELIVERED: 'border-delivered text-delivered',
  CANCELLED: 'border-line text-muted',
};
const CLOSE_UNAUTHORIZED = 4401;

/**
 * The one live client component: starts from the server's list, then applies WebSocket events by seq.
 * After a reconnect or a gap it catches up (GET /events?after=<lastSeq>) before applying anything newer.
 * The session token never reaches the browser: each connect opens /live with a fresh single-use ticket.
 */
export function Board({
  orders,
  lastSeq,
  apiUrl,
  role,
}: {
  orders: Order[];
  lastSeq: number;
  apiUrl: string;
  role: Role | null;
}) {
  const t = useTranslations('board');
  const status = useTranslations('status');
  const [board, setBoard] = useState<BoardState>(() => initialBoard(orders, lastSeq));
  const [connection, setConnection] = useState<ConnectionState>('reconnecting');
  const boardRef = useRef(board);
  const alert = useNewOrderAlert();
  const errorText = useErrorText();
  const canMove = role === 'STAFF' || role === 'ADMIN';
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropError, setDropError] = useState<ApiFailure | null>(null);
  const dragged = draggedId === null ? undefined : board.orders[draggedId];

  // same move as the card buttons: the API checks the version and the transition
  const drop = async (order: Order, to: OrderStatus) => {
    setDraggedId(null);
    setDropError(null);
    const result = await moveOrder(order.id, to, order.version);
    if (result.error) setDropError(result.error);
  };

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
      // an expired session redirects to /session-expired inside the action
      const result = await catchUpEvents(boardRef.current.lastSeq);
      if (!result.events) throw new Error(`catch-up failed: ${result.error?.message ?? ''}`);
      const events = result.events.filter(isEventWithOrder);
      apply(events);
      if (events.length < 500) return;
    }
  }, [apply]);

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

    const retry = () => {
      setConnection(attempt >= 2 ? 'offline' : 'reconnecting');
      timer = setTimeout(() => void connect(), reconnectDelay(attempt));
      attempt += 1;
    };

    const connect = async () => {
      // a ticket works once, so every reconnect asks for a new one
      const { ticket } = await liveTicket().catch(() => ({ ticket: undefined }));
      if (stopped) return;
      if (!ticket) {
        retry();
        return;
      }
      socket = new WebSocket(
        `${apiUrl.replace(/^http/, 'ws')}/live?ticket=${encodeURIComponent(ticket)}`,
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
          window.location.assign('/session-expired');
          return;
        }
        retry();
      };
    };

    void connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [apiUrl, apply, catchUp]);

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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((columnStatus) => {
          const items = column(board, columnStatus);
          const dropTarget = dragged && canDrop(dragged.status, columnStatus) ? dragged : null;
          return (
            <section
              key={columnStatus}
              aria-labelledby={`col-${columnStatus}`}
              className={`flex min-h-48 flex-col rounded-xl bg-panel-muted/70 p-3 ${
                dropTarget ? 'ring-2 ring-brand' : ''
              }`}
              onDragOver={dropTarget ? (event) => event.preventDefault() : undefined}
              onDrop={
                dropTarget
                  ? (event) => {
                      event.preventDefault();
                      void drop(dropTarget, columnStatus);
                    }
                  : undefined
              }
            >
              <h2
                id={`col-${columnStatus}`}
                className={`mb-3 flex items-end justify-between border-t-4 pt-2 font-display text-2xl font-extrabold tracking-wide ${LANE_COLOR[columnStatus]}`}
              >
                {status(columnStatus)}
                <span className="text-4xl leading-none tabular-nums">{items.length}</span>
              </h2>
              <ul className="flex flex-col gap-3">
                {items.map((order) => (
                  <li key={order.id}>
                    <OrderCard
                      order={order}
                      canMove={canMove}
                      onDragStart={setDraggedId}
                      onDragEnd={() => setDraggedId(null)}
                    />
                  </li>
                ))}
              </ul>
              {items.length === 0 && <p className="m-auto text-sm text-muted">{t('empty')}</p>}
            </section>
          );
        })}
      </div>
      <div aria-live="polite">
        {dropError && (
          <p role="alert" className="text-sm text-danger">
            {errorText(dropError)}
          </p>
        )}
      </div>

      <details className="panel p-3">
        <summary className="cursor-pointer font-semibold">
          {t('cancelled', { count: cancelled.length })}
        </summary>
        <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
