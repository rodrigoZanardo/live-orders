import type { Metadata, Viewport } from 'next';
import { Big_Shoulders, Figtree } from 'next/font/google';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { isTheme, THEME_COOKIE } from '@/lib/theme';
import './globals.css';

// Big Shoulders comes from city signage: tall, narrow numbers that read from across a kitchen.
// Figtree is a calm, open sans for everything people read up close.
const body = Figtree({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const display = Big_Shoulders({
  subsets: ['latin'],
  weight: ['700', '800'],
  adjustFontFallback: false,
  variable: '--font-display',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: t('name'), description: t('description') };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  return (
    <html
      lang={await getLocale()}
      data-theme={isTheme(theme) && theme !== 'system' ? theme : undefined}
      className={`${body.variable} ${display.variable}`}
    >
      <body className="min-h-screen font-sans antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
