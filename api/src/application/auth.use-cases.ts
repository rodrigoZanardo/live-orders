import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppError } from '../domain/errors';
import { User, type Role } from '../domain/user';
import { PasswordHasher, TokenService, UserRepository, type Actor } from './auth.ports';

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async execute(
    email: string,
    password: string,
    now = new Date(),
  ): Promise<{ token: string; user: Actor }> {
    const user = await this.users.findByEmail(User.normalizeEmail(email));
    if (!user) {
      throw new AppError('INVALID_CREDENTIALS');
    }

    // a locked account refuses even the right password, so guessing gains nothing during the lock
    const minutes = user.lockMinutesLeft(now);
    if (minutes > 0) {
      throw new AppError('TOO_MANY_ATTEMPTS', { minutes });
    }

    if (!(await this.hasher.verify(password, user.passwordHash))) {
      const failures = await this.users.recordFailedLogin(user.id);
      const lockUntil = User.lockAfterFailure(failures, now);
      if (lockUntil) {
        await this.users.lock(user.id, lockUntil);
      }
      throw new AppError('INVALID_CREDENTIALS');
    }

    if (user.failedLogins > 0 || user.lockedUntil) {
      await this.users.clearFailedLogins(user.id);
    }
    const actor: Actor = { id: user.id, email: user.email, role: user.role };
    return { token: await this.tokens.issue(actor), user: actor };
  }
}

@Injectable()
export class CreateUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: { email: string; password: string; role: Role }): Promise<User> {
    User.assertPassword(input.password);
    const user = User.create({
      id: randomUUID(),
      email: input.email,
      passwordHash: await this.hasher.hash(input.password),
      role: input.role,
    });
    await this.users.create(user);
    return user;
  }
}

@Injectable()
export class ListUsersUseCase {
  constructor(private readonly users: UserRepository) {}

  execute(): Promise<User[]> {
    return this.users.findAll();
  }
}

/** Creates the first admin from env on start; does nothing when that email already exists. */
@Injectable()
export class EnsureAdminUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly createUser: CreateUserUseCase,
  ) {}

  async execute(email: string, password: string): Promise<void> {
    if (await this.users.findByEmail(User.normalizeEmail(email))) {
      return;
    }
    await this.createUser.execute({ email, password, role: 'ADMIN' });
  }
}
