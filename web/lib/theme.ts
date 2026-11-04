export type Theme = 'system' | 'light' | 'dark';
export const THEME_COOKIE = 'theme';
export const THEMES: Theme[] = ['system', 'light', 'dark'];
export const isTheme = (value: string | undefined): value is Theme =>
  THEMES.some((theme) => theme === value);
