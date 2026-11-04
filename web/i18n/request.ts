import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { isLocale, type Locale } from './locales';

// The language lives in a cookie, not the URL: the app is behind login, so /en and /pt routes add nothing.
// First visit: the browser's language decides (Portuguese if it prefers pt, otherwise English).
export default getRequestConfig(async () => {
  const saved = (await cookies()).get('locale')?.value;
  const preferred = (await headers()).get('accept-language')?.toLowerCase().startsWith('pt')
    ? 'pt'
    : 'en';
  const locale: Locale = isLocale(saved) ? saved : preferred;
  // the server runs in UTC; Portuguese means a Brazilian user, so times show in Brasília time
  const timeZone = locale === 'pt' ? 'America/Sao_Paulo' : 'UTC';
  return { locale, timeZone, messages: (await import(`../messages/${locale}.json`)).default };
});
