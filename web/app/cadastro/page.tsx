import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { RegisterForm } from '@/components/RegisterForm';
import { BrandMark } from '@/components/Shell';

export default async function SignUpPage() {
  const t = await getTranslations('signup');
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-2 text-center">
          <BrandMark className="mx-auto size-14" />
          <h1 className="page-title">{t('title')}</h1>
          <p className="text-sm text-muted">{t('subtitle')}</p>
        </div>
        <div className="panel p-6">
          <RegisterForm />
        </div>
        <p className="text-center text-sm">
          {t('haveAccount')}{' '}
          <Link href="/login" className="font-semibold text-brand underline">
            {t('signIn')}
          </Link>
        </p>
        <div className="flex justify-center">
          <LocaleSwitcher />
        </div>
      </div>
    </main>
  );
}
