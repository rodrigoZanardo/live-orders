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
    <div role="group" aria-label={t('language')} className="grid grid-cols-2 gap-1">
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={locale === current}
          disabled={pending}
          onClick={() => start(() => setLocale(locale))}
          className="nav-link justify-center aria-pressed:bg-white/15 aria-pressed:text-white"
        >
          <Flag locale={locale} />
          {NAMES[locale]}
        </button>
      ))}
    </div>
  );
}
