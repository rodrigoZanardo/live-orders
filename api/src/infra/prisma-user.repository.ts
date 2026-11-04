import { Injectable } from '@nestjs/common';
import { Prisma, type User as UserRow } from '@prisma/client';
import { UserRepository } from '../application/auth.ports';
import { AppError } from '../domain/errors';
import { User } from '../domain/user';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaUserRepository extends UserRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.db.user.findUnique({ where: { email } });
    return row ? toUser(row) : null;
  }

  async findAll(): Promise<User[]> {
    const rows = await this.db.user.findMany({ orderBy: { email: 'asc' } });
    return rows.map(toUser);
  }

  async create(user: User): Promise<void> {
    try {
      await this.db.user.create({
        data: { id: user.id, email: user.email, passwordHash: user.passwordHash, role: user.role },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('EMAIL_TAKEN', { email: user.email });
      }
      throw error;
    }
  }

  async recordFailedLogin(userId: string): Promise<number> {
    const row = await this.db.user.update({
      where: { id: userId },
      data: { failedLogins: { increment: 1 } },
      select: { failedLogins: true },
    });
    return row.failedLogins;
  }

  async lock(userId: string, until: Date): Promise<void> {
    await this.db.user.update({
      where: { id: userId },
      data: { lockedUntil: until, failedLogins: 0 },
    });
  }

  async clearFailedLogins(userId: string): Promise<void> {
    await this.db.user.update({
      where: { id: userId },
      data: { lockedUntil: null, failedLogins: 0 },
    });
  }
}

function toUser(row: UserRow): User {
  return User.restore({
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    role: row.role,
    failedLogins: row.failedLogins,
    lockedUntil: row.lockedUntil,
  });
}
