import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { BrandMark } from '@/components/Shell';

export default async function HomePage() {
  const t = await getTranslations('home');
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <BrandMark className="mx-auto size-14" />
          <h1 className="page-title">Live Orders</h1>
          <p className="text-sm text-muted">{t('subtitle')}</p>
        </div>
        <div className="space-y-6">
          <div className="space-y-2">
            <Link href="/cliente" className="btn-primary block w-full text-center">
              {t('customer')}
            </Link>
            <p className="text-center text-xs text-muted">{t('customerHint')}</p>
          </div>
          <div className="space-y-2">
            <Link href="/gerencia" className="btn-secondary block w-full text-center">
              {t('management')}
            </Link>
            <p className="text-center text-xs text-muted">{t('managementHint')}</p>
          </div>
        </div>
        <div className="flex justify-center">
          <LocaleSwitcher />
        </div>
      </div>
    </main>
  );
}
