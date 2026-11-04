import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { OrderDetail, OrderEvent } from '@/lib/types';

async function load(id: string): Promise<OrderDetail> {
  try {
    return await api.order(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const order = await load((await params).id);
  const t = await getTranslations('order');
  const status = await getTranslations('status');
  const board = await getTranslations('board');
  const format = await getFormatter();

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
              </li>
            ))}
          </ul>
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
