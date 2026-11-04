import { createHmac, timingSafeEqual } from 'crypto';
import { AppError } from './errors';

/** A signed request older (or further in the future) than this is refused as a replay. */
export const WEBHOOK_MAX_AGE_SECONDS = 5 * 60;

/** `sha256=<hex>` of HMAC-SHA256 over `<timestamp>.<raw body>`; used for incoming and outgoing webhooks. */
export function signWebhook(secret: string, timestamp: string, body: string | Buffer): string {
  const hmac = createHmac('sha256', secret).update(`${timestamp}.`).update(body);
  return `sha256=${hmac.digest('hex')}`;
}

/** Throws WEBHOOK_SIGNATURE_INVALID or WEBHOOK_TOO_OLD; returns quietly when the request is genuine. */
export function verifyWebhook(input: {
  secret: string;
  signature: string | undefined;
  timestamp: string | undefined;
  body: Buffer;
  now: Date;
}): void {
  if (!input.signature || !input.timestamp || !/^\d+$/.test(input.timestamp)) {
    throw new AppError('WEBHOOK_SIGNATURE_INVALID');
  }

  const expected = Buffer.from(signWebhook(input.secret, input.timestamp, input.body));
  const actual = Buffer.from(input.signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new AppError('WEBHOOK_SIGNATURE_INVALID');
  }

  // checked after the signature, so an attacker cannot learn the window by probing unsigned requests
  const ageSeconds = Math.abs(input.now.getTime() / 1000 - Number(input.timestamp));
  if (ageSeconds > WEBHOOK_MAX_AGE_SECONDS) {
    throw new AppError('WEBHOOK_TOO_OLD');
  }
}
