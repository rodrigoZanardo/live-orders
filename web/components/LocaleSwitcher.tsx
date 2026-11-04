'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { setLocale } from '@/app/actions';
import { LOCALES } from '@/i18n/locales';
import { Flag } from './Flag';

const NAMES = { en: 'English', pt: 'Português' } as const;

export function LocaleSwitcher() {
  const t = useTranslations('nav');
  const current = useLocale();
  const [pending, start] = useTransition();

  return (
    <div role="group" aria-label={t('language')} className="flex gap-1">
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={locale === current}
          disabled={pending}
          onClick={() => start(() => setLocale(locale))}
          className="chip"
        >
          <Flag locale={locale} />
          <span className="sr-only sm:not-sr-only">{NAMES[locale]}</span>
        </button>
      ))}
    </div>
  );
}
