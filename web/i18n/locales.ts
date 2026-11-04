export const LOCALES = ['en', 'pt'] as const;
export type Locale = (typeof LOCALES)[number];
export const isLocale = (value: string | undefined): value is Locale =>
  LOCALES.some((locale) => locale === value);
