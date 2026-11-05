'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { logout } from '@/app/actions';
import type { Theme } from '@/lib/theme';
import type { Role } from '@/lib/types';
import { LocaleSwitcher } from './LocaleSwitcher';
import { NavLink } from './NavLink';
import { ThemeToggle } from './ThemeToggle';

/** The ticket mark: a pass ticket with its tear-off edge. */
export function BrandMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#1d5bd6" />
      <path d="M9 7h14v18l-2.33-1.75L18.33 25 16 23.25 13.67 25l-2.34-1.75L9 25z" fill="#fff" />
      <path d="M12.5 12.5h7M12.5 16.5h5" stroke="#1d5bd6" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A light top bar instead of a side rail: the board needs the full width for its four lanes.
 * On phones the tabs scroll sideways under the brand; settings stay one tap away.
 */
export function Shell({
  role,
  theme,
  children,
}: {
  role: Role | null;
  theme: Theme;
  children: ReactNode;
}) {
  const t = useTranslations('nav');
  const roles = useTranslations('roles');
  const canCreate = role === 'STAFF' || role === 'ADMIN';

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-[110rem] flex-wrap items-center gap-x-6 px-4 sm:px-6">
          <span className="flex items-center gap-2 py-2.5 font-display text-2xl font-extrabold tracking-wide">
            <BrandMark />
            Live Orders
          </span>
          <nav
            aria-label={t('menu')}
            className="order-last -mx-4 flex w-[calc(100%+2rem)] gap-5 overflow-x-auto px-4 md:order-none md:mx-0 md:w-auto md:px-0"
          >
            <NavLink href="/gerencia">{t('board')}</NavLink>
            {canCreate && (
              <>
                <NavLink href="/orders/new">{t('newOrder')}</NavLink>
                <NavLink href="/cliente">{t('stock')}</NavLink>
              </>
            )}
            {role === 'ADMIN' && (
              <>
                <NavLink href="/webhooks">{t('webhooks')}</NavLink>
                <NavLink href="/users">{t('users')}</NavLink>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2 py-2">
            {role && (
              <span className="hidden text-xs text-muted lg:inline">
                {t('signedInAs', { role: roles(role) })}
              </span>
            )}
            <LocaleSwitcher />
            <ThemeToggle initial={theme} />
            <form action={logout}>
              <button type="submit" className="chip">
                {t('logout')}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[110rem] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
