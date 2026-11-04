import type { Metadata, Viewport } from 'next';
import { Archivo, Archivo_Narrow, JetBrains_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { isTheme, THEME_COOKIE } from '@/lib/theme';
import './globals.css';

// Archivo reads well at small sizes on busy screens; the narrow cut fits column headings; mono keeps order numbers aligned.
const body = Archivo({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const display = Archivo_Narrow({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
  display: 'swap',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-mono',
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
      className={`${body.variable} ${display.variable} ${mono.variable}`}
    >
      <body className="min-h-screen font-sans antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
