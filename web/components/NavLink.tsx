'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** Spinner while the next page loads; replaces loading.tsx, which broke router.refresh (docs/HANDOFF.md). */
function Pending() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span
      className="ml-auto size-3 animate-spin rounded-full border-2 border-white/30 border-t-white"
      aria-hidden
    />
  ) : null;
}

export function NavLink({
  href,
  children,
  onNavigate,
}: {
  href: string;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  const path = usePathname();
  const active = href === '/' ? path === '/' : path.startsWith(href);
  return (
    <Link
      href={href}
      className="nav-link"
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
    >
      {children}
      <Pending />
    </Link>
  );
}
