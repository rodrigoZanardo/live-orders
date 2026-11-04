import { isIP } from 'net';
import { AppError } from './errors';

/** Loopback, private, link-local or unspecified: an address a webhook must not reach (SSRF). */
export function isPrivateAddress(ip: string): boolean {
  const address = ip.toLowerCase();
  if (isIP(address) === 4) {
    const [a = 0, b = 0] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (isIP(address) !== 6) return false;
  const mapped = /^::ffff:(.+)$/.exec(address)?.[1];
  if (mapped) {
    if (isIP(mapped) === 4) return isPrivateAddress(mapped);
    // hex form, e.g. ::ffff:7f00:1 = 127.0.0.1
    const [high = 0, low = 0] = mapped.split(':').map((part) => parseInt(part, 16));
    return isPrivateAddress([high >> 8, high & 255, low >> 8, low & 255].join('.'));
  }
  if (address === '::' || address === '::1') return true;
  const first = parseInt(address.split(':')[0] || '0', 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

/**
 * An outgoing webhook target must be an absolute http(s) URL; unless `allowPrivate`, not localhost
 * or a private IP literal (hostnames are resolved and checked again at delivery). Returns it normalized.
 */
export function validWebhookUrl(value: string, allowPrivate = false): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new AppError('WEBHOOK_URL_INVALID');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AppError('WEBHOOK_URL_INVALID');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (
    !allowPrivate &&
    (host === 'localhost' || host.endsWith('.localhost') || isPrivateAddress(host))
  ) {
    throw new AppError('WEBHOOK_URL_INVALID');
  }
  return url.toString();
}

/** Delays before each retry of a failed delivery; after the last one the delivery is FAILED. */
export const WEBHOOK_RETRY_DELAYS_MS = [1_000, 5_000, 30_000] as const;
