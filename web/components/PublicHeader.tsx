import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { logout } from '@/app/actions';
import type { Role } from '@/lib/types';
import { LocaleSwitcher } from './LocaleSwitcher';
import { BrandMark } from './Shell';

/** Top bar of the customer pages (no staff nav); a signed-in customer gets their orders and sign-out. */
export async function PublicHeader({ role }: { role: Role | null }) {
  const t = await getTranslations('catalog');
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-panel/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-wide"
        >
          <BrandMark />
          Live Orders
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {role === 'CUSTOMER' ? (
            <>
              <Link href="/meus-pedidos" className="chip">
                {t('myOrders')}
              </Link>
              <form action={logout}>
                <button type="submit" className="chip">
                  {t('logout')}
                </button>
              </form>
            </>
          ) : (
            <Link href="/" className="chip hidden sm:inline-flex">
              {t('back')}
            </Link>
          )}
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  );
}
