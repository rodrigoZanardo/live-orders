import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppError } from '../domain/errors';
import { LOGIN_RULES, User, type Role } from '../domain/user';
import { PasswordHasher, TokenService, UserRepository, type Actor } from './auth.ports';

@Injectable()
export class LoginUseCase {
  private dummy?: Promise<string>;

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
      // same scrypt cost as a known email, so response time does not reveal which emails exist
      await this.hasher.verify(password, await this.dummyHash());
      throw new AppError('INVALID_CREDENTIALS');
    }

    // a locked account refuses even the right password, so guessing gains nothing during the lock
    const minutes = user.lockMinutesLeft(now);
    if (minutes > 0) {
      throw new AppError('TOO_MANY_ATTEMPTS', { minutes });
    }

    // counted before checking, atomically: parallel guesses cannot get more than maxFailures checks
    const attempts = await this.users.recordLoginAttempt(user.id);
    const lockUntil = User.lockAfterFailure(attempts, now);
    if (attempts > LOGIN_RULES.maxFailures) {
      if (lockUntil) await this.users.lock(user.id, lockUntil);
      throw new AppError('TOO_MANY_ATTEMPTS', { minutes: LOGIN_RULES.lockMinutes });
    }

    if (!(await this.hasher.verify(password, user.passwordHash))) {
      if (lockUntil) await this.users.lock(user.id, lockUntil);
      throw new AppError('INVALID_CREDENTIALS');
    }

    await this.users.clearFailedLogins(user.id);
    const actor: Actor = { id: user.id, email: user.email, role: user.role };
    return { token: await this.tokens.issue(actor), user: actor };
  }

  private dummyHash(): Promise<string> {
    this.dummy ??= this.hasher.hash(randomUUID());
    return this.dummy;
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

/** Creates a user from env on start (first admin, demo account); does nothing when the email exists. */
@Injectable()
export class EnsureUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly createUser: CreateUserUseCase,
  ) {}

  async execute(email: string, password: string, role: Role): Promise<void> {
    if (await this.users.findByEmail(User.normalizeEmail(email))) {
      return;
    }
    await this.createUser.execute({ email, password, role });
  }
}
