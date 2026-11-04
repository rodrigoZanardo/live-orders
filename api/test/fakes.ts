import {
  PasswordHasher,
  TokenService,
  UserRepository,
  type Actor,
} from '../src/application/auth.ports';
import { AppError } from '../src/domain/errors';
import { User } from '../src/domain/user';

/** In-memory users for unit and HTTP tests. */
export class InMemoryUserRepository extends UserRepository {
  readonly users = new Map<string, User>();

  async findByEmail(email: string): Promise<User | null> {
    return [...this.users.values()].find((user) => user.email === email) ?? null;
  }

  async findAll(): Promise<User[]> {
    return [...this.users.values()].sort((a, b) => a.email.localeCompare(b.email));
  }

  async create(user: User): Promise<void> {
    if (await this.findByEmail(user.email)) {
      throw new AppError('EMAIL_TAKEN', { email: user.email });
    }
    this.users.set(user.id, user);
  }

  async recordFailedLogin(userId: string): Promise<number> {
    const user = this.get(userId);
    this.replace(user, { failedLogins: user.failedLogins + 1 });
    return user.failedLogins + 1;
  }

  async lock(userId: string, until: Date): Promise<void> {
    this.replace(this.get(userId), { lockedUntil: until, failedLogins: 0 });
  }

  async clearFailedLogins(userId: string): Promise<void> {
    this.replace(this.get(userId), { lockedUntil: null, failedLogins: 0 });
  }

  private get(userId: string): User {
    const user = this.users.get(userId);
    if (!user) throw new Error(`no user ${userId}`);
    return user;
  }

  private replace(user: User, changes: { failedLogins: number; lockedUntil?: Date | null }): void {
    this.users.set(
      user.id,
      User.restore({
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        role: user.role,
        lockedUntil: user.lockedUntil,
        ...changes,
      }),
    );
  }
}

/** Readable "hash" so tests stay fast; the real scrypt hasher has its own test. */
export class FakePasswordHasher extends PasswordHasher {
  async hash(password: string): Promise<string> {
    return `hashed:${password}`;
  }

  async verify(password: string, hash: string): Promise<boolean> {
    return hash === `hashed:${password}`;
  }
}

/** Token = JSON of the actor; `verify` refuses anything else. */
export class FakeTokenService extends TokenService {
  async issue(actor: Actor): Promise<string> {
    return Buffer.from(JSON.stringify(actor)).toString('base64url');
  }

  async verify(token: string): Promise<Actor | null> {
    try {
      const parsed: unknown = JSON.parse(Buffer.from(token, 'base64url').toString());
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'id' in parsed &&
        'email' in parsed &&
        'role' in parsed &&
        typeof parsed.id === 'string' &&
        typeof parsed.email === 'string' &&
        (parsed.role === 'ADMIN' || parsed.role === 'STAFF' || parsed.role === 'VIEWER')
      ) {
        return { id: parsed.id, email: parsed.email, role: parsed.role };
      }
    } catch {
      return null;
    }
    return null;
  }
}
