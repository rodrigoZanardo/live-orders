import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { currentRole } from '@/lib/api';
import { isTheme, THEME_COOKIE } from '@/lib/theme';

// No loading.tsx in this group on purpose: it made router.refresh() apply only part of the page (docs/HANDOFF.md).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  const role = await currentRole();
  // staff pages only: a customer goes to their own orders (the API refuses them here anyway)
  if (role === 'CUSTOMER') redirect('/meus-pedidos');
  return (
    <Shell role={role} theme={isTheme(theme) ? theme : 'system'}>
      {children}
    </Shell>
  );
}
