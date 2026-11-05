import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CancelMyOrderButton } from '@/components/CancelMyOrderButton';
import { PaymentText } from '@/components/PaymentText';
import { PublicHeader } from '@/components/PublicHeader';
import { RetrySoon } from '@/components/RetrySoon';
import { api, ApiError, currentRole } from '@/lib/api';
import { formatCents } from '@/lib/money';
import { isOpen, statusSteps } from '@/lib/timeline';

/**
 * The signed-in customer's own orders; the API returns only theirs.
 * Live without the staff WebSocket: while any order can still move, the page asks the server again every 15 s.
 */
export default async function MyOrdersPage() {
  const role = await currentRole();
  if (role !== 'CUSTOMER') redirect('/gerencia');
  const t = await getTranslations('myOrders');
  const status = await getTranslations('status');
  const format = await getFormatter();
  const locale = await getLocale();
  // only API refusals become the message; a session redirect must pass through
  const orders = await api.myOrders().catch((error: unknown) => {
    if (!(error instanceof ApiError)) throw error;
    console.error(error);
    return null;
  });

  return (
    <>
      <PublicHeader role={role} />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="page-title">{t('title')}</h1>
          <Link href="/cliente" className="btn-primary">
            {t('shop')}
          </Link>
        </div>
        {orders === null ? (
          <p role="status" className="text-muted">
            {t('unavailable')}
          </p>
        ) : orders.length === 0 ? (
          <p className="text-muted">{t('empty')}</p>
        ) : (
          <ul className="space-y-4">
            {orders.some((order) => isOpen(order.status)) && (
              <li className="list-none text-sm text-muted">
                {t('live')}
                <RetrySoon seconds={15} />
              </li>
            )}
            {orders.map((order) => (
              <li key={order.id} className="panel space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-display text-xl font-bold">
                    {t('number', { number: order.number })}
                  </h2>
                  <span className="badge bg-panel-muted">{status(order.status)}</span>
                  <time dateTime={order.createdAt} className="ml-auto text-sm text-muted">
                    {t('placedAt', {
                      date: format.dateTime(new Date(order.createdAt), {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }),
                    })}
                  </time>
                </div>
                <ol className="flex flex-wrap gap-x-2 gap-y-1 text-sm" aria-label={t('progress')}>
                  {statusSteps(order.status).map((step, index) => (
                    <li
                      key={step.status}
                      aria-current={step.state === 'current' ? 'step' : undefined}
                      className={
                        step.state === 'current'
                          ? 'font-semibold text-brand'
                          : step.state === 'done'
                            ? 'text-ink'
                            : 'text-muted'
                      }
                    >
                      {index > 0 && <span aria-hidden>→ </span>}
                      {step.state === 'done' ? '✓ ' : step.state === 'current' ? '● ' : '○ '}
                      {status(step.status)}
                    </li>
                  ))}
                </ol>
                <ul className="text-sm">
                  {order.items.map((item, index) => (
                    <li key={`${item.sku}-${index}`}>
                      <span className="font-semibold tabular-nums">{item.quantity}×</span>{' '}
                      {item.name} <span className="font-mono text-xs text-muted">{item.sku}</span>
                      {typeof item.unitPrice === 'number' && (
                        <span className="text-muted tabular-nums">
                          {' '}
                          · {formatCents(item.unitPrice * item.quantity, locale)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-sm">
                  {order.total !== null && (
                    <span className="font-semibold">
                      {t('total', { amount: formatCents(order.total, locale) })} ·{' '}
                    </span>
                  )}
                  <PaymentText order={order} />
                </p>
                {order.status === 'RECEIVED' && (
                  <CancelMyOrderButton id={order.id} version={order.version} />
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
