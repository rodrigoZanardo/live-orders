import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PaymentText } from '@/components/PaymentText';
import { currentRole, orderOrNotFound } from '@/lib/api';
import { formatCents } from '@/lib/money';
import { pickingList, type PickLine } from '@/lib/picking';
import { fetchStockProducts } from '@/lib/stock';
import type { OrderEvent } from '@/lib/types';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const order = await orderOrNotFound((await params).id);
  const role = await currentRole();
  const isStaff = role === 'STAFF' || role === 'ADMIN';
  // bin locations are fetched here, on the server, and only for staff; null = stock unreachable
  const picking = isStaff
    ? await fetchStockProducts().then(
        (products) => pickingList(order.items, products),
        (error: unknown) => {
          console.error(error);
          return null;
        },
      )
    : undefined;
  const t = await getTranslations('order');
  const status = await getTranslations('status');
  const board = await getTranslations('board');
  const p = await getTranslations('payment');
  const format = await getFormatter();
  const locale = await getLocale();

  const describe = (event: OrderEvent) => {
    if (event.type === 'ORDER_CREATED') return t('created_event');
    if (event.type === 'ORDER_LATE') return t('late_event');
    return t('moved_event', {
      from: event.fromStatus ? status(event.fromStatus) : '—',
      to: status(event.toStatus),
    });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/gerencia" className="text-sm text-brand hover:underline">
        ← {t('back')}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title">{t('detailTitle', { number: order.number })}</h1>
        <span className="badge bg-panel-muted">{status(order.status)}</span>
        {order.status === 'PREPARING' && order.lateSince && (
          <span className="badge bg-danger text-white">⚠ {board('late')}</span>
        )}
        {isStaff && (
          <Link href={`/orders/${order.id}/separacao`} className="btn-secondary ml-auto">
            {t('printSlip')}
          </Link>
        )}
      </div>

      <section className="panel grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
        <div>
          <h2 className="label">{t('customer')}</h2>
          <p>{order.customerName}</p>
        </div>
        <div>
          <h2 className="label">{t('channel')}</h2>
          <p>{order.channel === 'DELIVERY_PLATFORM' ? board('platform') : board('counter')}</p>
          {order.externalId && (
            <p className="text-sm text-muted">
              {t('externalId')}: <span className="font-mono">{order.externalId}</span>
            </p>
          )}
        </div>
        <div>
          <h2 className="label">{t('items')}</h2>
          <ul className="text-sm">
            {order.items.map((item, index) => (
              <li key={`${item.sku}-${index}`}>
                <span className="tabular-nums font-semibold">{item.quantity}×</span> {item.name}{' '}
                <span className="font-mono text-xs text-muted">{item.sku}</span>
                {typeof item.unitPrice === 'number' && (
                  <span className="text-muted tabular-nums">
                    {' '}
                    · {formatCents(item.unitPrice * item.quantity, locale)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {order.total !== null && (
            <p className="mt-1 text-sm font-semibold">
              {t('total')}: {formatCents(order.total, locale)}
            </p>
          )}
        </div>
        <div>
          <h2 className="label">{p('title')}</h2>
          <p className="text-sm">
            <PaymentText order={order} />
          </p>
        </div>
        {order.delivery && (
          <div>
            <h2 className="label">{t('address')}</h2>
            <address className="text-sm not-italic">
              {order.delivery.street}, {order.delivery.number}
              <br />
              {order.delivery.district} — {order.delivery.city}/{order.delivery.state}
              <br />
              <span className="font-mono">{order.delivery.cep}</span>
            </address>
          </div>
        )}
      </section>

      {picking !== undefined && <PickingList lines={picking} />}

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold">{t('timeline')}</h2>
        <ol className="relative space-y-4 border-l-2 border-line pl-5">
          {order.events.map((event) => (
            <li key={event.seq} className="relative">
              <span
                className={`absolute -left-[1.6rem] top-1.5 size-3 rounded-full ${
                  event.type === 'ORDER_LATE' ? 'bg-danger' : 'bg-brand'
                }`}
                aria-hidden
              />
              <p className="font-semibold">{describe(event)}</p>
              <p className="text-sm text-muted">
                <time dateTime={event.createdAt}>
                  {format.dateTime(new Date(event.createdAt), {
                    dateStyle: 'short',
                    timeStyle: 'medium',
                  })}
                </time>{' '}
                · {t('by', { actor: event.actorEmail })}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

async function PickingList({ lines }: { lines: PickLine[] | null }) {
  const t = await getTranslations('picking');
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-bold">{t('title')}</h2>
      {lines === null ? (
        <p role="status" className="text-sm text-muted">
          {t('unavailable')}
        </p>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{t('location')}</th>
                <th className="px-4 py-2 font-medium">{t('sku')}</th>
                <th className="px-4 py-2 font-medium">{t('item')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('quantity')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((line, index) => (
                <tr key={`${line.sku}-${index}`}>
                  <td className="px-4 py-2 font-mono">{line.location ?? t('noLocation')}</td>
                  <td className="px-4 py-2 font-mono text-xs">{line.sku}</td>
                  <td className="px-4 py-2">{line.name}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    {line.quantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
