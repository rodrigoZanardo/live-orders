import type { Role, User } from '../domain/user';

/** Port: users and their sign-in state. */
export abstract class UserRepository {
  abstract findByEmail(email: string): Promise<User | null>;
  abstract findAll(): Promise<User[]>;
  /** Throws EMAIL_TAKEN when the email already exists. */
  abstract create(user: User): Promise<void>;
  /** Counts one sign-in attempt atomically and returns the new count, so parallel attempts are all counted. */
  abstract recordLoginAttempt(userId: string): Promise<number>;
  /** Locks the account until the given time and resets the failure count. */
  abstract lock(userId: string, until: Date): Promise<void>;
  /** Clears the failure count and any lock after a successful sign-in. */
  abstract clearFailedLogins(userId: string): Promise<void>;
}

export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;
  abstract verify(password: string, hash: string): Promise<boolean>;
}

/** Who is calling, taken from a verified token. */
export type Actor = { id: string; email: string; role: Role };

export abstract class TokenService {
  abstract issue(actor: Actor): Promise<string>;
  /** Returns null for a missing, expired or forged token. */
  abstract verify(token: string): Promise<Actor | null>;
}
