import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { OrderForm } from '@/components/OrderForm';
import { currentRole } from '@/lib/api';

export default async function NewOrderPage() {
  const role = await currentRole();
  if (role !== 'STAFF' && role !== 'ADMIN') redirect('/');
  const t = await getTranslations('order');
  return (
    <div className="space-y-4">
      <h1 className="page-title">{t('newTitle')}</h1>
      <OrderForm />
    </div>
  );
}
