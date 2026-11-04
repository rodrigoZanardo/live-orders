/**
 * Every error the app can return, in one place.
 * `code` is stable and meant for clients to translate; `message` is the English fallback.
 * Placeholders use `{name}`, the same syntax next-intl uses in the web app.
 */
const CATALOG = {
  // orders
  ORDER_NOT_FOUND: { kind: 'not_found', message: 'Order not found.' },
  STATUS_MOVE_INVALID: { kind: 'rule', message: 'An order cannot move from {from} to {to}.' },
  ORDER_CHANGED: {
    kind: 'conflict',
    message: 'Someone else changed this order first. Reload it and try again.',
  },
  ITEMS_INVALID: {
    kind: 'rule',
    message:
      'An order needs 1 to {maxItems} items, each with a SKU, a name and a quantity from 1 to {maxQuantity}.',
  },
  CUSTOMER_NAME_INVALID: {
    kind: 'rule',
    message: 'Customer name must have 1 to {max} characters.',
  },
  CEP_INVALID: { kind: 'rule', message: 'CEP must have 8 digits.' },
  EXTERNAL_ID_REQUIRED: {
    kind: 'rule',
    message: 'Orders from the delivery platform need their external id.',
  },
  // webhooks
  WEBHOOK_SIGNATURE_INVALID: {
    kind: 'unauthorized',
    message: 'Webhook signature is missing or wrong.',
  },
  WEBHOOK_TOO_OLD: {
    kind: 'unauthorized',
    message: 'Webhook timestamp is too old or in the future.',
  },
  WEBHOOK_URL_INVALID: { kind: 'rule', message: 'Webhook URL must be a valid http or https URL.' },
  WEBHOOK_SUBSCRIPTION_NOT_FOUND: { kind: 'not_found', message: 'Webhook subscription not found.' },
  // users and login
  EMAIL_INVALID: { kind: 'rule', message: 'Email is not valid.' },
  PASSWORD_TOO_SHORT: { kind: 'rule', message: 'Password must have at least {min} characters.' },
  EMAIL_TAKEN: { kind: 'rule', message: 'User {email} already exists.' },
  INVALID_CREDENTIALS: { kind: 'unauthorized', message: 'Invalid email or password.' },
  TOO_MANY_ATTEMPTS: {
    kind: 'too_many',
    message: 'Too many failed sign-ins. Wait {minutes} minutes and try again.',
  },
  SESSION_INVALID: {
    kind: 'unauthorized',
    message: 'Your session is missing or expired. Sign in again.',
  },
  FORBIDDEN: { kind: 'forbidden', message: 'Your role cannot do this.' },
  // request shape, checked by the DTOs before any rule runs
  INVALID_INPUT: { kind: 'rule', message: 'Invalid input: {details}' },
} as const satisfies Record<string, { kind: ErrorKind; message: string }>;

export type ErrorKind =
  'rule' | 'not_found' | 'unauthorized' | 'forbidden' | 'conflict' | 'too_many';
export type ErrorCode = keyof typeof CATALOG;
export type ErrorParams = Record<string, string | number>;

export const ERROR_CODES = Object.keys(CATALOG);

export class AppError extends Error {
  readonly kind: ErrorKind;

  constructor(
    readonly code: ErrorCode,
    readonly params: ErrorParams = {},
  ) {
    const entry = CATALOG[code];
    super(
      entry.message.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`)),
    );
    this.kind = entry.kind;
  }
}
