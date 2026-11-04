import { AppError } from '../src/domain/errors';
import { signWebhook, verifyWebhook } from '../src/domain/webhook-signature';

const secret = 'test-secret';
const now = new Date('2026-11-03T12:00:00Z');
const timestamp = String(now.getTime() / 1000);
const body = Buffer.from('{"externalId":"x1"}');

function codeOf(input: Partial<Parameters<typeof verifyWebhook>[0]>): string | undefined {
  try {
    verifyWebhook({
      secret,
      signature: signWebhook(secret, timestamp, body),
      timestamp,
      body,
      now,
      ...input,
    });
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  return undefined;
}

describe('webhook signature', () => {
  it('accepts a genuine request', () => {
    expect(codeOf({})).toBeUndefined();
  });

  it.each([
    ['a missing signature', { signature: undefined }],
    ['a missing timestamp', { timestamp: undefined }],
    ['a non-numeric timestamp', { timestamp: 'yesterday' }],
    ['another secret', { signature: signWebhook('other', timestamp, body) }],
    ['a changed body', { body: Buffer.from('{"externalId":"x2"}') }],
    ['a signature for another timestamp', { signature: signWebhook(secret, '1', body) }],
  ])('refuses %s with WEBHOOK_SIGNATURE_INVALID', (_, input) => {
    expect(codeOf(input)).toBe('WEBHOOK_SIGNATURE_INVALID');
  });

  it.each([
    ['older than 5 minutes', -301],
    ['more than 5 minutes in the future', 301],
  ])('refuses a request %s with WEBHOOK_TOO_OLD', (_, offset) => {
    const stamp = String(now.getTime() / 1000 + offset);
    expect(codeOf({ timestamp: stamp, signature: signWebhook(secret, stamp, body) })).toBe(
      'WEBHOOK_TOO_OLD',
    );
  });

  it('accepts a request exactly 5 minutes old', () => {
    const stamp = String(now.getTime() / 1000 - 300);
    expect(
      codeOf({ timestamp: stamp, signature: signWebhook(secret, stamp, body) }),
    ).toBeUndefined();
  });
});
