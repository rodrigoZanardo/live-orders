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
import {
  CreateOrderUseCase,
  GetOrderUseCase,
  ListEventsUseCase,
  ListOrdersUseCase,
  MoveOrderUseCase,
} from './application/order.use-cases';
import { lateAfterMs, requiredEnv } from './env';
import { LateOrderTimer, MarkLateUseCase } from './application/late-orders';
import { BullLateOrderTimer } from './infra/late-orders.queue';
import { AppErrorFilter } from './http/app-error.filter';
import { AuthController, UsersController } from './http/auth.controller';
import { EventController, HealthController, OrderController } from './http/order.controller';
import { AuthGuard } from './http/auth.guard';
import { JwtTokenService, ScryptPasswordHasher } from './infra/auth.services';
import { PrismaOrderRepository } from './infra/prisma-order.repository';
import { PrismaUserRepository } from './infra/prisma-user.repository';
import { PrismaService } from './infra/prisma.service';
import { LiveEvents } from './application/live-events';
import { EventBus, RedisEventBus } from './realtime/event-bus';
import { LiveGateway } from './realtime/live.gateway';
import { AddressLookup } from './application/address-lookup';
import {
  CleanupIdempotencyKeysUseCase,
  ReceivePlatformOrderUseCase,
} from './application/platform-orders';
import { CleanupQueue } from './infra/cleanup.queue';
import { ViaCepClient } from './infra/viacep.client';
import { AddressController, IncomingWebhookController } from './http/webhooks.controller';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({ secret: requiredEnv('JWT_SECRET'), signOptions: { expiresIn: '12h' } }),
    }),
  ],
  controllers: [
    AuthController,
    UsersController,
    OrderController,
    EventController,
    HealthController,
    IncomingWebhookController,
    AddressController,
  ],
  providers: [
    PrismaService,
    { provide: UserRepository, useClass: PrismaUserRepository },
    { provide: OrderRepository, useClass: PrismaOrderRepository },
    { provide: PasswordHasher, useClass: ScryptPasswordHasher },
    { provide: TokenService, useClass: JwtTokenService },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AppErrorFilter },
    { provide: EventBus, useFactory: () => new RedisEventBus(requiredEnv('REDIS_URL')) },
    { provide: LiveEvents, useExisting: EventBus },
    LiveGateway,
    MarkLateUseCase,
    ReceivePlatformOrderUseCase,
    CleanupIdempotencyKeysUseCase,
    { provide: AddressLookup, useFactory: () => new ViaCepClient() },
    {
      provide: CleanupQueue,
      inject: [CleanupIdempotencyKeysUseCase],
      useFactory: (cleanup: CleanupIdempotencyKeysUseCase) =>
        new CleanupQueue(requiredEnv('REDIS_URL'), cleanup),
    },
    {
      provide: LateOrderTimer,
      inject: [MarkLateUseCase],
      useFactory: (markLate: MarkLateUseCase) =>
        new BullLateOrderTimer(requiredEnv('REDIS_URL'), lateAfterMs(), markLate),
    },
    LoginUseCase,
    CreateUserUseCase,
    ListUsersUseCase,
    EnsureAdminUseCase,
    CreateOrderUseCase,
    ListOrdersUseCase,
    GetOrderUseCase,
    MoveOrderUseCase,
    ListEventsUseCase,
  ],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private readonly ensureAdmin: EnsureAdminUseCase) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureAdmin.execute(requiredEnv('ADMIN_EMAIL'), requiredEnv('ADMIN_PASSWORD'));
  }
}
