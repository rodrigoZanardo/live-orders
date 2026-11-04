import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DeleteSubscriptionButton, SubscriptionForm } from '@/components/SubscriptionForm';
import { api, currentRole } from '@/lib/api';
import type { DeliveryStatus } from '@/lib/types';

const FILTERS: (DeliveryStatus | undefined)[] = [undefined, 'PENDING', 'SENT', 'FAILED'];
const STATUS_STYLE: Record<DeliveryStatus, string> = {
  PENDING: 'bg-warning-subtle text-warning',
  SENT: 'bg-success-subtle text-success',
  FAILED: 'bg-danger-subtle text-danger',
};

function asStatus(value: string | undefined): DeliveryStatus | undefined {
  return value === 'PENDING' || value === 'SENT' || value === 'FAILED' ? value : undefined;
}

export default async function WebhooksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if ((await currentRole()) !== 'ADMIN') redirect('/gerencia');
  const status = asStatus((await searchParams).status);
  const [subscriptions, deliveries] = await Promise.all([
    api.subscriptions(),
    api.deliveries(status),
  ]);
  const t = await getTranslations('webhooks');
  const format = await getFormatter();

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="page-title">{t('title')}</h1>
        <p className="max-w-2xl text-sm text-muted">{t('intro')}</p>
      </div>

      <SubscriptionForm />

      <section className="panel overflow-x-auto">
        {subscriptions.length === 0 ? (
          <p className="p-4 text-sm text-muted">{t('none')}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('url')}</th>
                <th>{t('updated')}</th>
                <th>
                  <span className="sr-only">{t('remove')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((subscription) => (
                <tr key={subscription.id}>
                  <td className="font-mono break-all">{subscription.url}</td>
                  <td className="whitespace-nowrap">
                    {format.dateTime(new Date(subscription.createdAt), {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="text-right">
                    <DeleteSubscriptionButton id={subscription.id} url={subscription.url} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold">{t('deliveries')}</h2>
          <nav aria-label={t('filter')} className="flex flex-wrap gap-1">
            {FILTERS.map((filter) => (
              <Link
                key={filter ?? 'all'}
                href={filter ? `/webhooks?status=${filter}` : '/webhooks'}
                aria-current={filter === status ? 'page' : undefined}
                className="btn-secondary py-1 text-xs aria-[current=page]:border-brand aria-[current=page]:text-brand"
              >
                {filter ? t(`deliveryStatus.${filter}`) : t('all')}
              </Link>
            ))}
          </nav>
        </div>
        <div className="panel overflow-x-auto">
          {deliveries.length === 0 ? (
            <p className="p-4 text-sm text-muted">{t('noDeliveries')}</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('event')}</th>
                  <th>{t('url')}</th>
                  <th>{t('filter')}</th>
                  <th>{t('attempts')}</th>
                  <th>{t('lastError')}</th>
                  <th>{t('updated')}</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td className="whitespace-nowrap font-mono">
                      #{delivery.eventSeq} {delivery.eventType}
                    </td>
                    <td className="max-w-56 truncate font-mono" title={delivery.url}>
                      {delivery.url}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_STYLE[delivery.status]}`}>
                        {t(`deliveryStatus.${delivery.status}`)}
                      </span>
                    </td>
                    <td className="font-mono">{delivery.attempts}</td>
                    <td className="text-danger">{delivery.lastError ?? '—'}</td>
                    <td className="whitespace-nowrap">
                      {format.dateTime(new Date(delivery.updatedAt), { timeStyle: 'medium' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
