import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** One database connection pool shared by every repository. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  onModuleDestroy(): Promise<void> {
    return this.$disconnect();
  }
}
