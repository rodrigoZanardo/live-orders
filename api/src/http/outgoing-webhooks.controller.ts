import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  CreateSubscriptionUseCase,
  DELIVERY_STATUSES,
  DeleteSubscriptionUseCase,
  ListDeliveriesUseCase,
  ListSubscriptionsUseCase,
  type DeliveryStatus,
} from '../application/outgoing-webhooks';
import { EVENT_TYPES, type EventType } from '../application/order-repository';
import { AppError } from '../domain/errors';
import { ApiErrorResponse } from './api-error';
import { Roles } from './auth.guard';

class CreateSubscriptionDto {
  @ApiProperty({ example: 'https://example.com/hooks/live-orders' })
  @IsString()
  @MaxLength(500)
  url!: string;
}

class DeliveriesQuery {
  @ApiPropertyOptional({ enum: DELIVERY_STATUSES })
  @IsOptional()
  @IsIn(DELIVERY_STATUSES)
  status?: DeliveryStatus;
}

class SubscriptionResponse {
  @ApiProperty() id!: string;
  @ApiProperty() url!: string;
  @ApiProperty() active!: boolean;
  @ApiProperty() createdAt!: Date;
}

class CreatedSubscriptionResponse extends SubscriptionResponse {
  @ApiProperty({ description: 'Signing secret; shown only in this response' }) secret!: string;
}

class DeliveryResponse {
  @ApiProperty() id!: string;
  @ApiProperty() subscriptionId!: string;
  @ApiProperty() url!: string;
  @ApiProperty() eventSeq!: number;
  @ApiProperty({ enum: EVENT_TYPES }) eventType!: EventType;
  @ApiProperty({ enum: DELIVERY_STATUSES }) status!: DeliveryStatus;
  @ApiProperty() attempts!: number;
  @ApiProperty({ type: String, nullable: true }) lastError!: string | null;
  @ApiProperty() updatedAt!: Date;
}

const subscriptionId = new ParseUUIDPipe({
  exceptionFactory: () => new AppError('WEBHOOK_SUBSCRIPTION_NOT_FOUND'),
});

@ApiTags('webhooks (admin)')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller()
export class OutgoingWebhooksController {
  constructor(
    private readonly createSubscription: CreateSubscriptionUseCase,
    private readonly listSubscriptions: ListSubscriptionsUseCase,
    private readonly deleteSubscription: DeleteSubscriptionUseCase,
    private readonly listDeliveries: ListDeliveriesUseCase,
  ) {}

  @Get('webhook-subscriptions')
  @ApiOperation({ summary: 'List outgoing webhook subscriptions, newest first' })
  @ApiResponse({ status: 200, type: [SubscriptionResponse] })
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'Not an admin')
  list(): Promise<SubscriptionResponse[]> {
    return this.listSubscriptions.execute();
  }

  @Post('webhook-subscriptions')
  @ApiOperation({ summary: 'Register a URL that receives every order event, signed' })
  @ApiResponse({ status: 201, type: CreatedSubscriptionResponse })
  @ApiErrorResponse(400, 'URL is not http(s), or invalid input')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'Not an admin')
  create(@Body() body: CreateSubscriptionDto): Promise<CreatedSubscriptionResponse> {
    return this.createSubscription.execute(body.url);
  }

  @Delete('webhook-subscriptions/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a subscription and its delivery history' })
  @ApiResponse({ status: 204, description: 'Removed' })
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'Not an admin')
  @ApiErrorResponse(404, 'Subscription not found')
  async remove(@Param('id', subscriptionId) id: string): Promise<void> {
    await this.deleteSubscription.execute(id);
  }

  @Get('webhook-deliveries')
  @ApiOperation({ summary: 'Delivery attempts, newest first (at most 100)' })
  @ApiResponse({ status: 200, type: [DeliveryResponse] })
  @ApiErrorResponse(400, 'Invalid status')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'Not an admin')
  deliveries(@Query() query: DeliveriesQuery): Promise<DeliveryResponse[]> {
    return this.listDeliveries.execute(query.status);
  }
}
