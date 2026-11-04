import { AppError } from './errors';

export const ROLES = ['ADMIN', 'STAFF', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

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
};

export class User {
  private constructor(private readonly props: UserProps) {}

  static create(input: { id: string; email: string; passwordHash: string; role: Role }): User {
    const email = User.normalizeEmail(input.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError('EMAIL_INVALID');
    }
    return new User({ ...input, email, failedLogins: 0, lockedUntil: null });
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

  /** Whole minutes left in the lock (at least 1), or 0 when the account is not locked. */
  lockMinutesLeft(now: Date): number {
    const lockedUntil = this.props.lockedUntil;
    if (!lockedUntil || lockedUntil <= now) {
      return 0;
    }
    return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
  }
}
