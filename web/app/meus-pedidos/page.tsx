import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CancelMyOrderButton } from '@/components/CancelMyOrderButton';
import { PublicHeader } from '@/components/PublicHeader';
import { api, ApiError, currentRole } from '@/lib/api';

/** The signed-in customer's own orders; the API returns only theirs. */
export default async function MyOrdersPage() {
  const role = await currentRole();
  if (role !== 'CUSTOMER') redirect('/gerencia');
  const t = await getTranslations('myOrders');
  const status = await getTranslations('status');
  const format = await getFormatter();
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
                <ul className="text-sm">
                  {order.items.map((item, index) => (
                    <li key={`${item.sku}-${index}`}>
                      <span className="font-semibold tabular-nums">{item.quantity}×</span>{' '}
                      {item.name} <span className="font-mono text-xs text-muted">{item.sku}</span>
                    </li>
                  ))}
                </ul>
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
