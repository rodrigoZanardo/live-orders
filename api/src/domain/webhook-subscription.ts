import { AppError } from './errors';

/** An outgoing webhook target must be an absolute http(s) URL. Returns it normalized. */
export function validWebhookUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new AppError('WEBHOOK_URL_INVALID');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AppError('WEBHOOK_URL_INVALID');
  }
  return url.toString();
}

/** Delays before each retry of a failed delivery; after the last one the delivery is FAILED. */
export const WEBHOOK_RETRY_DELAYS_MS = [1_000, 5_000, 30_000] as const;
