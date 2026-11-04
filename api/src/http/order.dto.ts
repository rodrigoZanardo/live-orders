import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { EventWithOrder } from '../application/order.use-cases';
import { EVENT_TYPES, type EventType, type OrderEvent } from '../application/order-repository';
import { ORDER_CHANNELS, ORDER_RULES, type Order, type OrderChannel } from '../domain/order';
import { ORDER_STATUSES, type OrderStatus } from '../domain/order-status';

// The DTOs check shape and size; the domain checks the business rules and returns their codes.

export class OrderItemDto {
  @ApiProperty({ example: 'BRG-01' }) @IsString() @MaxLength(32) sku!: string;
  @ApiProperty({ example: 'Burger' }) @IsString() @MaxLength(80) name!: string;
  @ApiProperty({ example: 2, minimum: 1, maximum: ORDER_RULES.maxQuantity })
  @IsInt()
  quantity!: number;
}

export class DeliveryAddressDto {
  @ApiProperty({ example: '01001-000' }) @IsString() @MaxLength(9) cep!: string;
  @ApiProperty({ example: 'Praça da Sé' }) @IsString() @MaxLength(120) street!: string;
  @ApiProperty({ example: '100' }) @IsString() @MaxLength(20) number!: string;
  @ApiProperty({ example: 'Sé' }) @IsString() @MaxLength(80) district!: string;
  @ApiProperty({ example: 'São Paulo' }) @IsString() @MaxLength(80) city!: string;
  @ApiProperty({ example: 'SP' }) @IsString() @MaxLength(2) state!: string;
}

export class CreateOrderDto {
  @ApiProperty({ example: 'Ana', maxLength: ORDER_RULES.maxCustomerName })
  @IsString()
  @MaxLength(200)
  customerName!: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ORDER_RULES.maxItems)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @ApiPropertyOptional({ type: DeliveryAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  delivery?: DeliveryAddressDto;
}

export class MoveOrderDto {
  @ApiProperty({ enum: ORDER_STATUSES }) @IsIn(ORDER_STATUSES) to!: OrderStatus;
  @ApiProperty({ description: 'The version the caller saw', example: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class ListOrdersQuery {
  @ApiPropertyOptional({ example: '2026-11-03', description: 'Business day; today when omitted' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}

export class EventsQuery {
  @ApiPropertyOptional({ example: 0, description: 'Return events with a greater seq' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  after?: number;
}

export class OrderResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Daily number shown on screens' }) number!: number;
  @ApiProperty() customerName!: string;
  @ApiProperty({ enum: ORDER_CHANNELS }) channel!: OrderChannel;
  @ApiProperty({ type: [OrderItemDto] }) items!: OrderItemDto[];
  @ApiProperty({ type: DeliveryAddressDto, nullable: true }) delivery!: DeliveryAddressDto | null;
  @ApiProperty({ enum: ORDER_STATUSES }) status!: OrderStatus;
  @ApiProperty() version!: number;
  @ApiProperty() statusChangedAt!: Date;
  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'Set while the order is late in PREPARING',
  })
  lateSince!: Date | null;
  @ApiProperty({ type: String, nullable: true }) externalId!: string | null;
  @ApiProperty() createdAt!: Date;
}

export class EventResponse {
  @ApiProperty() seq!: number;
  @ApiProperty({ enum: EVENT_TYPES }) type!: EventType;
  @ApiProperty() orderId!: string;
  @ApiProperty({ enum: ORDER_STATUSES, nullable: true }) fromStatus!: OrderStatus | null;
  @ApiProperty({ enum: ORDER_STATUSES }) toStatus!: OrderStatus;
  @ApiProperty() version!: number;
  @ApiProperty() actorEmail!: string;
  @ApiProperty() createdAt!: Date;
}

export class EventWithOrderResponse extends EventResponse {
  @ApiProperty({ type: OrderResponse, description: 'Current state of the order' })
  order!: OrderResponse;
}

export class OrderDetailResponse extends OrderResponse {
  @ApiProperty({ type: [EventResponse], description: 'Timeline, oldest first' })
  events!: EventResponse[];
}

export function toOrderResponse(order: Order): OrderResponse {
  return {
    id: order.id,
    number: order.number,
    customerName: order.customerName,
    channel: order.channel,
    items: order.items.map((item) => ({ ...item })),
    delivery: order.delivery,
    status: order.status,
    version: order.version,
    statusChangedAt: order.statusChangedAt,
    lateSince: order.lateSince,
    externalId: order.externalId,
    createdAt: order.createdAt,
  };
}

export function toEventResponse(event: OrderEvent): EventResponse {
  return {
    seq: event.seq,
    type: event.type,
    orderId: event.orderId,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    version: event.version,
    actorEmail: event.actorEmail,
    createdAt: event.createdAt,
  };
}

export function toEventWithOrderResponse(event: EventWithOrder): EventWithOrderResponse {
  return { ...toEventResponse(event), order: toOrderResponse(event.order) };
}
