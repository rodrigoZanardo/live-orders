import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Injectable,
  UseGuards,
  Param,
  Post,
  Res,
  type CanActivate,
  type ExecutionContext,
  type RawBodyRequest,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { Request, Response } from 'express';
import { AddressLookup } from '../application/address-lookup';
import { ReceivePlatformOrderUseCase } from '../application/platform-orders';
import { AppError } from '../domain/errors';
import { verifyWebhook } from '../domain/webhook-signature';
import { ORDER_RULES } from '../domain/order';
import { requiredEnv } from '../env';
import { ApiErrorResponse } from './api-error';
import { Public, Roles } from './auth.guard';
import { OrderItemDto, OrderResponse, toOrderResponse } from './order.dto';

class PlatformDeliveryDto {
  @ApiProperty({ example: '01001-000' }) @IsString() @MaxLength(9) cep!: string;
  @ApiProperty({ example: '100' }) @IsString() @MaxLength(20) number!: string;
  @ApiPropertyOptional({ example: 'apt 3' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  complement?: string;
}

export class PlatformOrderDto {
  @ApiProperty({ example: 'ifood-123' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  externalId!: string;
  @ApiProperty({ example: 'Bruno' }) @IsString() @MaxLength(200) customerName!: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ORDER_RULES.maxItems)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @ApiPropertyOptional({ type: PlatformDeliveryDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlatformDeliveryDto)
  delivery?: PlatformDeliveryDto;
}

class AddressDto {
  @ApiProperty() street!: string;
  @ApiProperty() district!: string;
  @ApiProperty() city!: string;
  @ApiProperty() state!: string;
}

export class AddressResponse {
  @ApiProperty({ description: 'false when the CEP is unknown or ViaCEP is unavailable' })
  found!: boolean;
  @ApiPropertyOptional({ type: AddressDto }) address?: AddressDto;
}

/** Checks the HMAC signature and timestamp before the body is validated, so unsigned callers learn nothing. */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    verifyWebhook({
      secret: requiredEnv('WEBHOOK_INCOMING_SECRET'),
      signature: request.header('x-signature'),
      timestamp: request.header('x-timestamp'),
      body: request.rawBody ?? Buffer.alloc(0),
      now: new Date(),
    });
    return true;
  }
}

@ApiTags('webhooks')
@Controller('webhooks')
export class IncomingWebhookController {
  constructor(private readonly receive: ReceivePlatformOrderUseCase) {}

  @Public()
  @UseGuards(WebhookSignatureGuard)
  @Post('orders')
  @ApiOperation({
    summary: 'Incoming order from the delivery platform (signed, see docs/WEBHOOKS.md)',
  })
  @ApiHeader({ name: 'X-Signature', description: 'sha256=<hex HMAC of "<timestamp>.<raw body>">' })
  @ApiHeader({ name: 'X-Timestamp', description: 'Unix seconds; at most 5 minutes old' })
  @ApiHeader({ name: 'Idempotency-Key', description: 'Same key again returns the first order' })
  @ApiResponse({ status: 201, type: OrderResponse, description: 'Order created' })
  @ApiResponse({ status: 200, type: OrderResponse, description: 'Already received; same order' })
  @ApiErrorResponse(400, 'Invalid body or missing Idempotency-Key')
  @ApiErrorResponse(409, 'Idempotency-Key was already used for another order')
  @ApiErrorResponse(401, 'Wrong or missing signature, or timestamp out of the 5 minute window')
  async orders(
    @Res({ passthrough: true }) response: Response,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: PlatformOrderDto,
  ): Promise<OrderResponse> {
    if (!idempotencyKey?.trim() || idempotencyKey.length > 200) {
      throw new AppError('INVALID_INPUT', { details: 'Idempotency-Key header is required' });
    }
    const { order, created } = await this.receive.execute(idempotencyKey, body);
    response.status(created ? 201 : 200);
    return toOrderResponse(order);
  }
}

@ApiTags('address')
@ApiBearerAuth()
@Controller('address')
export class AddressController {
  constructor(private readonly addresses: AddressLookup) {}

  @Roles('STAFF', 'ADMIN')
  @Get(':cep')
  @HttpCode(200)
  @ApiOperation({ summary: 'Look up a Brazilian CEP on ViaCEP (3 s timeout)' })
  @ApiResponse({ status: 200, type: AddressResponse })
  @ApiErrorResponse(400, 'CEP is not 8 digits')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'Viewers cannot look up addresses')
  lookup(@Param('cep') cep: string): Promise<AddressResponse> {
    if (!/^\d{5}-?\d{3}$/.test(cep)) {
      throw new AppError('CEP_INVALID');
    }
    return this.addresses.lookup(cep);
  }
}
