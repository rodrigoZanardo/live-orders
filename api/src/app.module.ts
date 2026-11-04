import { Module, type OnApplicationBootstrap } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PasswordHasher, TokenService, UserRepository } from './application/auth.ports';
import {
  CreateUserUseCase,
  EnsureAdminUseCase,
  ListUsersUseCase,
  LoginUseCase,
} from './application/auth.use-cases';
import { OrderRepository } from './application/order-repository';
import { requiredEnv } from './env';
import { AppErrorFilter } from './http/app-error.filter';
import { AuthController, UsersController } from './http/auth.controller';
import { AuthGuard } from './http/auth.guard';
import { JwtTokenService, ScryptPasswordHasher } from './infra/auth.services';
import { PrismaOrderRepository } from './infra/prisma-order.repository';
import { PrismaUserRepository } from './infra/prisma-user.repository';
import { PrismaService } from './infra/prisma.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({ secret: requiredEnv('JWT_SECRET'), signOptions: { expiresIn: '12h' } }),
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [
    PrismaService,
    { provide: UserRepository, useClass: PrismaUserRepository },
    { provide: OrderRepository, useClass: PrismaOrderRepository },
    { provide: PasswordHasher, useClass: ScryptPasswordHasher },
    { provide: TokenService, useClass: JwtTokenService },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AppErrorFilter },
    LoginUseCase,
    CreateUserUseCase,
    ListUsersUseCase,
    EnsureAdminUseCase,
  ],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private readonly ensureAdmin: EnsureAdminUseCase) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureAdmin.execute(requiredEnv('ADMIN_EMAIL'), requiredEnv('ADMIN_PASSWORD'));
  }
}
