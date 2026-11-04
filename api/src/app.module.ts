import { Module, type OnApplicationBootstrap } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PasswordHasher, TokenService, UserRepository } from './application/auth.ports';
import {
  CreateUserUseCase,
  EnsureUserUseCase,
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
import { LiveTickets } from './application/live-tickets';
import { RedisLiveTickets } from './infra/redis-live-tickets';
import { LiveController } from './http/live.controller';
import { AddressLookup } from './application/address-lookup';
import {
  CleanupIdempotencyKeysUseCase,
  ReceivePlatformOrderUseCase,
} from './application/platform-orders';
import { CleanupQueue } from './infra/cleanup.queue';
import {
  CreateSubscriptionUseCase,
  DeleteSubscriptionUseCase,
  DeliverWebhookUseCase,
  DeliveryQueue,
  FanOutLiveEvents,
  ListDeliveriesUseCase,
  ListSubscriptionsUseCase,
  RequeueStaleDeliveriesUseCase,
  WebhookDispatch,
  WebhookRepository,
  WebhookSender,
} from './application/outgoing-webhooks';
import { WEBHOOK_RETRY_DELAYS_MS } from './domain/webhook-subscription';
import { OutgoingWebhooksController } from './http/outgoing-webhooks.controller';
import { toEventWithOrderResponse } from './http/order.dto';
import { PrismaWebhookRepository } from './infra/prisma-webhook.repository';
import { BullDeliveryQueue, FetchWebhookSender } from './infra/webhook-delivery.queue';
import { ViaCepClient } from './infra/viacep.client';
import { StockAvailability } from './application/stock-availability';
import { StockClient } from './infra/stock.client';
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
    OutgoingWebhooksController,
    LiveController,
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
    {
      provide: LiveEvents,
      inject: [EventBus, WebhookDispatch],
      useFactory: (bus: EventBus, webhooks: WebhookDispatch) =>
        new FanOutLiveEvents([bus, webhooks]),
    },
    {
      provide: WebhookDispatch,
      inject: [WebhookRepository, DeliveryQueue],
      useFactory: (repository: WebhookRepository, queue: DeliveryQueue) =>
        new WebhookDispatch(repository, queue, (event) =>
          JSON.stringify(toEventWithOrderResponse(event)),
        ),
    },
    {
      provide: DeliveryQueue,
      inject: [DeliverWebhookUseCase],
      useFactory: (deliver: DeliverWebhookUseCase) =>
        new BullDeliveryQueue(requiredEnv('REDIS_URL'), deliver, WEBHOOK_RETRY_DELAYS_MS),
    },
    { provide: WebhookRepository, useClass: PrismaWebhookRepository },
    { provide: WebhookSender, useClass: FetchWebhookSender },
    DeliverWebhookUseCase,
    RequeueStaleDeliveriesUseCase,
    CreateSubscriptionUseCase,
    ListSubscriptionsUseCase,
    DeleteSubscriptionUseCase,
    ListDeliveriesUseCase,
    LiveGateway,
    { provide: LiveTickets, useFactory: () => new RedisLiveTickets(requiredEnv('REDIS_URL')) },
    MarkLateUseCase,
    ReceivePlatformOrderUseCase,
    CleanupIdempotencyKeysUseCase,
    { provide: AddressLookup, useFactory: () => new ViaCepClient() },
    {
      provide: StockAvailability,
      // not required at boot: without them the API boots and refuses counter orders (STOCK_UNAVAILABLE)
      useFactory: () =>
        new StockClient(
          process.env.STOCK_API_URL ?? '',
          process.env.STOCK_API_EMAIL ?? '',
          process.env.STOCK_API_PASSWORD ?? '',
        ),
    },
    {
      provide: CleanupQueue,
      inject: [CleanupIdempotencyKeysUseCase, RequeueStaleDeliveriesUseCase],
      useFactory: (
        cleanup: CleanupIdempotencyKeysUseCase,
        requeue: RequeueStaleDeliveriesUseCase,
      ) => new CleanupQueue(requiredEnv('REDIS_URL'), cleanup, requeue),
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
    EnsureUserUseCase,
    CreateOrderUseCase,
    ListOrdersUseCase,
    GetOrderUseCase,
    MoveOrderUseCase,
    ListEventsUseCase,
  ],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private readonly ensureUser: EnsureUserUseCase) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureUser.execute(
      requiredEnv('ADMIN_EMAIL'),
      requiredEnv('ADMIN_PASSWORD'),
      'ADMIN',
    );
    // optional public demo account: STAFF, so visitors can move orders but not manage users or webhooks
    const demoEmail = process.env.DEMO_EMAIL?.trim();
    const demoPassword = process.env.DEMO_PASSWORD;
    if (demoEmail && demoPassword) {
      await this.ensureUser.execute(demoEmail, demoPassword, 'STAFF');
    }
  }
}
