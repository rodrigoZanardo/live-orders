import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { LoginForm } from '@/components/LoginForm';
import { BrandMark } from '@/components/Shell';

export default async function LoginPage() {
  const t = await getTranslations('login');
  // shown only when the demo account is configured (public demo); the admin password never appears here
  const demo =
    process.env.DEMO_EMAIL && process.env.DEMO_PASSWORD
      ? { email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD }
      : undefined;

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <BrandMark className="mx-auto size-14" />
          <h1 className="page-title">Live Orders</h1>
          <p className="text-sm text-muted">{t('subtitle')}</p>
        </div>
        <div className="panel p-6">
          <h2 className="mb-4 text-lg font-semibold">{t('title')}</h2>
          <LoginForm demo={demo} />
        </div>
        <p className="text-center text-sm">
          {t('noAccount')}{' '}
          <Link href="/cadastro" className="font-semibold text-brand underline">
            {t('register')}
          </Link>
        </p>
        <div className="flex justify-center">
          <LocaleSwitcher />
        </div>
      </div>
    </main>
  );
}
