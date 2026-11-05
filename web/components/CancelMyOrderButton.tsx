'use client';

import { useTranslations } from 'next-intl';
import { cancelMyOrder } from '@/app/actions';
import { FormMessage, useAction } from './form';

/** Shown only while the order is RECEIVED; the API decides again and answers with a code if it moved on. */
export function CancelMyOrderButton({ id, version }: { id: string; version: number }) {
  const t = useTranslations('myOrders');
  const { result, pending, run } = useAction();
  return (
    <div className="space-y-1">
      <button
        type="button"
        className="btn-secondary"
        disabled={pending}
        onClick={() => run(() => cancelMyOrder(id, version))}
      >
        {pending ? t('cancelling') : t('cancel')}
      </button>
      <FormMessage result={result} />
    </div>
  );
}
