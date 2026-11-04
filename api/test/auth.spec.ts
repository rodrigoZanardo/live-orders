import { JwtService } from '@nestjs/jwt';
import {
  CreateUserUseCase,
  EnsureAdminUseCase,
  LoginUseCase,
} from '../src/application/auth.use-cases';
import { AppError } from '../src/domain/errors';
import { User } from '../src/domain/user';
import { JwtTokenService, ScryptPasswordHasher } from '../src/infra/auth.services';
import { FakePasswordHasher, FakeTokenService, InMemoryUserRepository } from './fakes';

const now = new Date('2026-11-03T12:00:00Z');
const minutesLater = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  return undefined;
}

describe('User', () => {
  it('normalizes the email and refuses an invalid one', () => {
    const user = User.create({
      id: 'u1',
      email: ' Ana@Example.COM ',
      passwordHash: 'h',
      role: 'STAFF',
    });
    expect(user.email).toBe('ana@example.com');
    expect(() => User.create({ id: 'u2', email: 'ana', passwordHash: 'h', role: 'STAFF' })).toThrow(
      expect.objectContaining({ code: 'EMAIL_INVALID' }),
    );
  });

  it('refuses a password shorter than 8 characters', () => {
    expect(() => User.assertPassword('1234567')).toThrow(
      expect.objectContaining({ code: 'PASSWORD_TOO_SHORT', params: { min: 8 } }),
    );
    expect(() => User.assertPassword('12345678')).not.toThrow();
  });

  it('locks for 15 minutes at the fifth failure', () => {
    expect(User.lockAfterFailure(4, now)).toBeNull();
    expect(User.lockAfterFailure(5, now)).toEqual(minutesLater(15));
  });
});

describe('LoginUseCase', () => {
  let users: InMemoryUserRepository;
  let login: LoginUseCase;

  beforeEach(async () => {
    users = new InMemoryUserRepository();
    const hasher = new FakePasswordHasher();
    login = new LoginUseCase(users, hasher, new FakeTokenService());
    await new CreateUserUseCase(users, hasher).execute({
      email: 'staff@example.com',
      password: 'right-password',
      role: 'STAFF',
    });
  });

  it('returns a token and the user for the right password, ignoring email case', async () => {
    const result = await login.execute(' STAFF@example.com ', 'right-password', now);
    expect(result.user).toMatchObject({ email: 'staff@example.com', role: 'STAFF' });
    expect(await new FakeTokenService().verify(result.token)).toEqual(result.user);
  });

  it('refuses an unknown email and a wrong password with the same code', async () => {
    expect(await codeOf(login.execute('nobody@example.com', 'right-password', now))).toBe(
      'INVALID_CREDENTIALS',
    );
    expect(await codeOf(login.execute('staff@example.com', 'wrong', now))).toBe(
      'INVALID_CREDENTIALS',
    );
  });

  it('locks after 5 failures, refuses even the right password, then unlocks after 15 minutes', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(await codeOf(login.execute('staff@example.com', 'wrong', now))).toBe(
        'INVALID_CREDENTIALS',
      );
    }

    const locked = login.execute('staff@example.com', 'right-password', minutesLater(1));
    await expect(locked).rejects.toMatchObject({
      code: 'TOO_MANY_ATTEMPTS',
      params: { minutes: 14 },
    });

    await expect(
      login.execute('staff@example.com', 'right-password', minutesLater(15)),
    ).resolves.toBeDefined();
  });

  it('clears earlier failures after a successful sign-in', async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      await codeOf(login.execute('staff@example.com', 'wrong', now));
    }
    await login.execute('staff@example.com', 'right-password', now);
    await codeOf(login.execute('staff@example.com', 'wrong', now));

    expect((await users.findByEmail('staff@example.com'))?.failedLogins).toBe(1);
  });
});

describe('CreateUserUseCase and EnsureAdminUseCase', () => {
  it('refuses a taken email and creates the admin only once', async () => {
    const users = new InMemoryUserRepository();
    const createUser = new CreateUserUseCase(users, new FakePasswordHasher());
    const ensureAdmin = new EnsureAdminUseCase(users, createUser);

    await ensureAdmin.execute('admin@example.com', 'admin-password');
    await ensureAdmin.execute('ADMIN@example.com', 'other-password');

    expect((await users.findAll()).map((user) => [user.email, user.role])).toEqual([
      ['admin@example.com', 'ADMIN'],
    ]);
    const duplicate = createUser.execute({
      email: 'admin@example.com',
      password: 'x'.repeat(8),
      role: 'STAFF',
    });
    expect(await codeOf(duplicate)).toBe('EMAIL_TAKEN');
  });
});

describe('ScryptPasswordHasher', () => {
  it('verifies the right password only, with a different salt each time', async () => {
    const hasher = new ScryptPasswordHasher();
    const first = await hasher.hash('secret-password');
    const second = await hasher.hash('secret-password');

    expect(first).not.toBe(second);
    expect(await hasher.verify('secret-password', first)).toBe(true);
    expect(await hasher.verify('wrong-password', first)).toBe(false);
    expect(await hasher.verify('secret-password', 'not-a-hash')).toBe(false);
  });
});

describe('JwtTokenService', () => {
  it('round-trips the actor and refuses a token signed with another secret', async () => {
    const tokens = new JwtTokenService(new JwtService({ secret: 'test-secret' }));
    const actor = { id: 'u1', email: 'a@example.com', role: 'VIEWER' as const };
    expect(await tokens.verify(await tokens.issue(actor))).toEqual(actor);

    const forged = await new JwtService({ secret: 'other' }).signAsync({
      sub: 'u1',
      email: 'a',
      role: 'ADMIN',
    });
    expect(await tokens.verify(forged)).toBeNull();
    expect(await tokens.verify('garbage')).toBeNull();
  });
});
