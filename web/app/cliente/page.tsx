import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { CustomerCatalog } from '@/components/CustomerCatalog';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { RetrySoon } from '@/components/RetrySoon';
import { BrandMark } from '@/components/Shell';
import { currentRole } from '@/lib/api';
import { listStockProducts } from '@/lib/stock';

// Outside the staff group: no staff nav. Anyone can see the products; orders need a staff sign-in.
export default async function CustomerPage() {
  const t = await getTranslations('catalog');
  const role = await currentRole();
  // exact quantities only for staff and admin; everyone else gets availability, decided on the server
  const exact = role === 'STAFF' || role === 'ADMIN';
  const products = await listStockProducts(exact).catch((error: unknown) => {
    console.error(error);
    return null;
  });

  return (
    <>
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
            <Link href="/" className="chip hidden sm:inline-flex">
              {t('back')}
            </Link>
            <LocaleSwitcher />
          </div>
        </div>
      </header>
      <main>
        {products ? (
          <CustomerCatalog products={products} role={role} />
        ) : (
          <p role="status" className="mx-auto max-w-6xl px-4 py-10 text-muted sm:px-6">
            {t('unavailable')}
            <RetrySoon />
          </p>
        )}
      </main>
    </>
  );
}
