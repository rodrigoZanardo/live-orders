import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PaymentText } from '@/components/PaymentText';
import { PrintButton } from '@/components/PrintButton';
import { currentRole, orderOrNotFound } from '@/lib/api';
import { pickingList } from '@/lib/picking';
import { fetchStockProducts } from '@/lib/stock';

/** Printable picking slip, staff only: lines walked in bin order, a box to tick each, a signature line. */
export default async function PickingSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await currentRole();
  // bin locations are staff only; viewers read the order but do not pick it
  if (role !== 'STAFF' && role !== 'ADMIN') redirect(`/orders/${id}`);
  const order = await orderOrNotFound(id);
  // stock down: the slip still prints, in ticket order, with no locations
  const products = await fetchStockProducts().catch((error: unknown) => {
    console.error(error);
    return [];
  });
  const lines = pickingList(order.items, products);
  const t = await getTranslations('picking');
  const o = await getTranslations('order');
  const format = await getFormatter();
  const delivery = order.delivery;

  return (
    <article className="max-w-3xl space-y-6 print:max-w-none print:text-black">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/orders/${order.id}`} className="text-sm text-brand hover:underline">
          ← {o('detailTitle', { number: order.number })}
        </Link>
        <PrintButton label={t('print')} />
      </div>

      <h1 className="page-title">{t('slipTitle', { number: order.number })}</h1>

      <dl className="grid gap-3 text-sm sm:grid-cols-2 print:grid-cols-2">
        <div>
          <dt className="label">{t('date')}</dt>
          <dd>
            {format.dateTime(new Date(order.createdAt), { dateStyle: 'short', timeStyle: 'short' })}
          </dd>
        </div>
        <div>
          <dt className="label">{t('customer')}</dt>
          <dd>{order.customerName}</dd>
        </div>
        <div>
          <dt className="label">{t('delivery')}</dt>
          <dd>
            {delivery ? (
              <address className="not-italic">
                {delivery.street}, {delivery.number} · {delivery.district} · {delivery.city}/
                {delivery.state} · <span className="font-mono">{delivery.cep}</span>
              </address>
            ) : (
              t('counterPickup')
            )}
          </dd>
        </div>
        <div>
          <dt className="label">{o('payment')}</dt>
          <dd>
            <PaymentText order={order} />
          </dd>
        </div>
      </dl>

      <table className="w-full border-collapse text-sm">
        <thead className="text-left">
          <tr className="border-b-2 border-ink">
            <th className="py-2 pr-3 font-semibold">{t('location')}</th>
            <th className="py-2 pr-3 font-semibold">{t('sku')}</th>
            <th className="py-2 pr-3 font-semibold">{t('item')}</th>
            <th className="py-2 pr-3 text-right font-semibold">{t('quantity')}</th>
            <th className="py-2 text-center font-semibold">{t('picked')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${line.sku}-${index}`} className="border-b border-line break-inside-avoid">
              <td className="py-3 pr-3 font-mono">{line.location ?? t('noLocation')}</td>
              <td className="py-3 pr-3 font-mono text-xs">{line.sku}</td>
              <td className="py-3 pr-3">{line.name}</td>
              <td className="py-3 pr-3 text-right text-base font-bold tabular-nums">
                {line.quantity}
              </td>
              <td className="py-3 text-center">
                <span aria-hidden className="inline-block size-5 border-2 border-ink" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="pt-12 text-sm">
        <span className="block border-t border-ink pt-1 sm:w-2/3">{t('signature')}</span>
      </p>
    </article>
  );
}
