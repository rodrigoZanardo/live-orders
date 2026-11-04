'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Asks the server for the page again every few seconds, so a sleeping demo service fixes itself without a manual reload. */
export function RetrySoon({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
