'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { THEME_COOKIE, THEMES, type Theme } from '@/lib/theme';

/** Cycles Auto → Light → Dark. Saved in a cookie so the server renders the right theme with no flash. */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const t = useTranslations('theme');
  const [theme, setTheme] = useState(initial);

  const next = () => {
    const value = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] ?? 'system';
    setTheme(value);
    if (value === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = value;
    document.cookie = `${THEME_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <button
      type="button"
      onClick={next}
      className="nav-link w-full justify-between border border-white/20"
      aria-label={t('label', { current: t(theme) })}
    >
      <span className="flex items-center gap-2">
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
        </svg>
        {t('title')}
      </span>
      <span className="text-white">{t(theme)}</span>
    </button>
  );
}
