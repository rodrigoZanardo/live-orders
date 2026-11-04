import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Actor } from '../application/auth.ports';
import {
  CreateOrderUseCase,
  GetOrderUseCase,
  ListEventsUseCase,
  ListOrdersUseCase,
  MoveOrderUseCase,
} from '../application/order.use-cases';
import { AppError } from '../domain/errors';
import { ApiErrorResponse } from './api-error';
import { CurrentUser, Public, Roles } from './auth.guard';
import {
  CreateOrderDto,
  EventsQuery,
  EventWithOrderResponse,
  ListOrdersQuery,
  MoveOrderDto,
  OrderDetailResponse,
  OrderResponse,
  toEventResponse,
  toEventWithOrderResponse,
  toOrderResponse,
} from './order.dto';

/** A malformed id cannot match an order: answer like a missing one, in the API error format. */
const orderId = new ParseUUIDPipe({ exceptionFactory: () => new AppError('ORDER_NOT_FOUND') });

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrderController {
  constructor(
    private readonly createOrder: CreateOrderUseCase,
    private readonly listOrders: ListOrdersUseCase,
    private readonly getOrder: GetOrderUseCase,
    private readonly moveOrder: MoveOrderUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Orders of a business day (default today), by number' })
  @ApiResponse({ status: 200, type: [OrderResponse] })
  @ApiErrorResponse(400, 'Invalid date')
  @ApiErrorResponse(401, 'Missing or expired token')
  async list(@Query() query: ListOrdersQuery): Promise<OrderResponse[]> {
    return (await this.listOrders.execute(query.date)).map(toOrderResponse);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One order with its event timeline' })
  @ApiResponse({ status: 200, type: OrderDetailResponse })
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(404, 'Order not found')
  async get(@Param('id', orderId) id: string): Promise<OrderDetailResponse> {
    const { order, events } = await this.getOrder.execute(id);
    return { ...toOrderResponse(order), events: events.map(toEventResponse) };
  }

  @Roles('STAFF', 'ADMIN')
  @Post()
  @ApiOperation({ summary: 'Create a counter order; returns its ORDER_CREATED event' })
  @ApiResponse({ status: 201, type: EventWithOrderResponse })
  @ApiErrorResponse(400, 'Invalid customer name, items, CEP or input')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'Viewers cannot create orders')
  async create(
    @Body() body: CreateOrderDto,
    @CurrentUser() actor: Actor,
  ): Promise<EventWithOrderResponse> {
    return toEventWithOrderResponse(await this.createOrder.execute(body, actor));
  }

  @Roles('STAFF', 'ADMIN')
  @Post(':id/status')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Move an order to another status; returns the ORDER_STATUS_CHANGED event',
  })
  @ApiResponse({ status: 200, type: EventWithOrderResponse })
  @ApiErrorResponse(400, 'Move not allowed from the current status, or invalid input')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'Viewers cannot move orders')
  @ApiErrorResponse(404, 'Order not found')
  @ApiErrorResponse(409, 'Someone else moved the order first (old version)')
  async move(
    @Param('id', orderId) id: string,
    @Body() body: MoveOrderDto,
    @CurrentUser() actor: Actor,
  ): Promise<EventWithOrderResponse> {
    return toEventWithOrderResponse(await this.moveOrder.execute({ id, ...body }, actor));
  }
}

@ApiTags('events')
@ApiBearerAuth()
@Controller('events')
export class EventController {
  constructor(private readonly listEvents: ListEventsUseCase) {}

  @Get('last')
  @ApiOperation({ summary: 'The newest event seq (0 when there are none)' })
  @ApiResponse({ status: 200, schema: { example: { lastSeq: 42 } } })
  @ApiErrorResponse(401, 'Missing or expired token')
  async last(): Promise<{ lastSeq: number }> {
    return { lastSeq: await this.listEvents.lastSeq() };
  }

  @Get()
  @ApiOperation({ summary: 'Catch-up: events after a sequence number, oldest first, at most 500' })
  @ApiResponse({ status: 200, type: [EventWithOrderResponse] })
  @ApiErrorResponse(400, 'Invalid sequence number')
  @ApiErrorResponse(401, 'Missing or expired token')
  async list(@Query() query: EventsQuery): Promise<EventWithOrderResponse[]> {
    return (await this.listEvents.execute(query.after ?? 0)).map(toEventWithOrderResponse);
  }
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness check for Render and docker' })
  @ApiResponse({ status: 200, schema: { example: { status: 'ok' } } })
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
