import { getTranslations } from 'next-intl/server';
import { CustomerCatalog } from '@/components/CustomerCatalog';
import { PublicHeader } from '@/components/PublicHeader';
import { RetrySoon } from '@/components/RetrySoon';
import { currentRole } from '@/lib/api';
import { listStockProducts } from '@/lib/stock';

// Outside the staff group: no staff nav. Anyone can see the products; staff and signed-in customers order.
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
      <PublicHeader role={role} />
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
