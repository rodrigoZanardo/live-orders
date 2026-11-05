import { useLocale, useTranslations } from 'next-intl';
import { formatCents } from '@/lib/money';
import type { Order } from '@/lib/types';

/** "Cash on delivery · Change for R$ 50,00"; shared by server pages and the board card. */
export function PaymentText({ order }: { order: Pick<Order, 'paymentMethod' | 'changeFor'> }) {
  const p = useTranslations('payment');
  const locale = useLocale();
  if (!order.paymentMethod) return <>{p('none')}</>;
  return (
    <>
      {p(order.paymentMethod)}
      {order.changeFor !== null &&
        ` · ${p('changeFor', { amount: formatCents(order.changeFor, locale) })}`}
    </>
  );
}
