import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { LoginForm } from '@/components/LoginForm';

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
          <svg viewBox="0 0 32 32" className="mx-auto size-12" aria-hidden>
            <rect width="32" height="32" rx="7" fill="#b8361e" />
            <path d="M9 8h14v16l-3-2-2 2-2-2-2 2-2-2-3 2z" fill="#fffdf8" />
            <path d="M12 13h8M12 17h6" stroke="#b8361e" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <h1 className="page-title">Live Orders</h1>
          <p className="text-sm text-muted">{t('subtitle')}</p>
        </div>
        <div className="panel p-6">
          <h2 className="mb-4 text-lg font-semibold">{t('title')}</h2>
          <LoginForm demo={demo} />
        </div>
        <div className="rounded-lg bg-rail p-2">
          <LocaleSwitcher />
        </div>
      </div>
    </main>
  );
}
