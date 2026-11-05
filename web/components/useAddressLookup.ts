'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { lookupAddress } from '@/app/actions';
import type { DeliveryAddress } from '@/lib/types';

type Found = Omit<DeliveryAddress, 'cep' | 'number'>;

/** CEP lookup for address forms: checks the format, asks the API (ViaCEP) and hands the found address to `fill`. */
export function useAddressLookup(fill: (address: Found) => void) {
  const t = useTranslations('order');
  const v = useTranslations('order.validation');
  const [message, setMessage] = useState<string | null>(null);
  const [lookingUp, start] = useTransition();

  const lookup = (value: string) =>
    start(async () => {
      setMessage(null);
      const cep = value.trim();
      if (!/^\d{5}-?\d{3}$/.test(cep)) {
        setMessage(v('cep'));
        return;
      }
      const found = await lookupAddress(cep);
      if (found.found && found.address) fill(found.address);
      else setMessage(t('cepNotFound'));
    });

  return { message, lookingUp, lookup };
}
