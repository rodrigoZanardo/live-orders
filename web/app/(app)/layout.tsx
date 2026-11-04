import { cookies } from 'next/headers';
import { Shell } from '@/components/Shell';
import { currentRole } from '@/lib/api';
import { isTheme, THEME_COOKIE } from '@/lib/theme';

// No loading.tsx in this group on purpose: it made router.refresh() apply only part of the page (docs/HANDOFF.md).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  return (
    <Shell role={await currentRole()} theme={isTheme(theme) ? theme : 'system'}>
      {children}
    </Shell>
  );
}
