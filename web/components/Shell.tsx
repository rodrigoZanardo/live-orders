'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { logout } from '@/app/actions';
import type { Theme } from '@/lib/theme';
import type { Role } from '@/lib/types';
import { LocaleSwitcher } from './LocaleSwitcher';
import { NavLink } from './NavLink';
import { ThemeToggle } from './ThemeToggle';

function Brand() {
  return (
    <span className="flex items-center gap-2 font-display text-lg font-bold text-white">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="7" fill="#b8361e" />
        <path d="M9 8h14v16l-3-2-2 2-2-2-2 2-2-2-3 2z" fill="#fffdf8" />
        <path d="M12 13h8M12 17h6" stroke="#b8361e" strokeWidth="2" strokeLinecap="round" />
      </svg>
      Live Orders
    </span>
  );
}

/** Dark side rail on desktop; a top bar with a collapsible menu on phones. */
export function Shell({
  role,
  theme,
  apiDocsUrl,
  children,
}: {
  role: Role | null;
  theme: Theme;
  apiDocsUrl: string;
  children: ReactNode;
}) {
  const t = useTranslations('nav');
  const roles = useTranslations('roles');
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const canCreate = role === 'STAFF' || role === 'ADMIN';

  return (
    <div className="lg:grid lg:min-h-screen lg:grid-cols-[15rem_1fr]">
      <header className="sticky top-0 z-20 bg-rail lg:static lg:flex lg:h-screen lg:flex-col lg:sticky">
        <div className="flex items-center justify-between px-4 py-3 lg:py-5">
          <Brand />
          <button
            type="button"
            className="nav-link lg:hidden"
            aria-expanded={open}
            aria-controls="main-nav"
            onClick={() => setOpen(!open)}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d={open ? 'M6 6l12 12M18 6 6 18' : 'M4 7h16M4 12h16M4 17h16'} />
            </svg>
            <span className="sr-only">{t('menu')}</span>
          </button>
        </div>
        <nav
          id="main-nav"
          className={`${open ? 'flex' : 'hidden'} flex-col gap-1 px-3 pb-4 lg:flex lg:flex-1`}
        >
          <NavLink href="/" onNavigate={close}>
            {t('board')}
          </NavLink>
          {canCreate && (
            <NavLink href="/orders/new" onNavigate={close}>
              {t('newOrder')}
            </NavLink>
          )}
          {role === 'ADMIN' && (
            <>
              <NavLink href="/webhooks" onNavigate={close}>
                {t('webhooks')}
              </NavLink>
              <NavLink href="/users" onNavigate={close}>
                {t('users')}
              </NavLink>
            </>
          )}
          <a href={apiDocsUrl} className="nav-link" target="_blank" rel="noreferrer">
            {t('apiDocs')} ↗
          </a>
          <div className="mt-4 flex flex-col gap-2 border-t border-white/15 pt-4 lg:mt-auto">
            {role && (
              <p className="px-3 text-xs text-white/60">{t('signedInAs', { role: roles(role) })}</p>
            )}
            <LocaleSwitcher />
            <ThemeToggle initial={theme} />
            <form action={logout}>
              <button type="submit" className="nav-link w-full">
                {t('logout')}
              </button>
            </form>
          </div>
        </nav>
      </header>
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
