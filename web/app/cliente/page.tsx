import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { CustomerCatalog } from '@/components/CustomerCatalog';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
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
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/" className="chip">
          {t('back')}
        </Link>
        <span className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-wide">
          <BrandMark />
          Live Orders
        </span>
        <div className="ml-auto">
          <LocaleSwitcher />
        </div>
      </header>
      <h1 className="page-title">{t('title')}</h1>
      {products ? (
        <CustomerCatalog products={products} role={role} />
      ) : (
        <p role="alert" className="text-sm text-danger">
          {t('unavailable')}
        </p>
      )}
    </main>
  );
}
