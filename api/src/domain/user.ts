import { AppError } from './errors';
import { ORDER_RULES, validDelivery, type DeliveryAddress } from './order';

export const ROLES = ['ADMIN', 'STAFF', 'VIEWER', 'CUSTOMER'] as const;
export type Role = (typeof ROLES)[number];
/** Everyone but customers: they read the board, the orders of the day and the live feed. */
export const STAFF_ROLES = ['ADMIN', 'STAFF', 'VIEWER'] as const satisfies readonly Role[];

/** A customer's own address; the complement is kept apart so the form can show it again. */
export type CustomerAddress = DeliveryAddress & { complement: string | null };

/** Name and saved address of a CUSTOMER; their orders always use these, never what a request sends. */
export type CustomerProfile = { name: string; address: CustomerAddress };

export function isRole(value: string): value is Role {
  return ROLES.some((role) => role === value);
}

export const LOGIN_RULES = {
  minPassword: 8,
  maxFailures: 5,
  lockMinutes: 15,
} as const;

export type UserProps = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  failedLogins: number;
  lockedUntil: Date | null;
  profile: CustomerProfile | null;
};

export class User {
  private constructor(private readonly props: UserProps) {}

  static create(input: {
    id: string;
    email: string;
    passwordHash: string;
    role: Role;
    profile?: CustomerProfile | null;
  }): User {
    const email = User.normalizeEmail(input.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError('EMAIL_INVALID');
    }
    const profile = input.profile ? validProfile(input.profile) : null;
    return new User({ ...input, email, profile, failedLogins: 0, lockedUntil: null });
  }

  static restore(props: UserProps): User {
    return new User({ ...props });
  }

  static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /** Checked on the plain password, before it is hashed. */
  static assertPassword(password: string): void {
    if (password.length < LOGIN_RULES.minPassword) {
      throw new AppError('PASSWORD_TOO_SHORT', { min: LOGIN_RULES.minPassword });
    }
  }

  /** When a failed sign-in brings the count to the limit, the account locks until the returned time. */
  static lockAfterFailure(failedLogins: number, now: Date): Date | null {
    if (failedLogins < LOGIN_RULES.maxFailures) {
      return null;
    }
    return new Date(now.getTime() + LOGIN_RULES.lockMinutes * 60_000);
  }

  get id(): string {
    return this.props.id;
  }

  get email(): string {
    return this.props.email;
  }

  get passwordHash(): string {
    return this.props.passwordHash;
  }

  get role(): Role {
    return this.props.role;
  }

  get failedLogins(): number {
    return this.props.failedLogins;
  }

  get lockedUntil(): Date | null {
    return this.props.lockedUntil;
  }

  get profile(): CustomerProfile | null {
    return this.props.profile;
  }

  /** Whole minutes left in the lock (at least 1), or 0 when the account is not locked. */
  lockMinutesLeft(now: Date): number {
    const lockedUntil = this.props.lockedUntil;
    if (!lockedUntil || lockedUntil <= now) {
      return 0;
    }
    return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
  }
}

function validProfile(input: CustomerProfile): CustomerProfile {
  const name = input.name.trim();
  if (name.length === 0 || name.length > ORDER_RULES.maxCustomerName) {
    throw new AppError('CUSTOMER_NAME_INVALID', { max: ORDER_RULES.maxCustomerName });
  }
  const address = validDelivery(input.address);
  if (!address.street || !address.number || !address.city || !/^[A-Z]{2}$/.test(address.state)) {
    throw new AppError('ADDRESS_INCOMPLETE');
  }
  return { name, address: { ...address, complement: input.address.complement?.trim() || null } };
}
