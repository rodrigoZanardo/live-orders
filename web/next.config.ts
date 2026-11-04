import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Defense in depth: the app never needs to be framed, sniffed or to leak full URLs to other sites.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  headers: async () => [{ source: '/:path*', headers: securityHeaders }],
};

export default createNextIntlPlugin('./i18n/request.ts')(nextConfig);
