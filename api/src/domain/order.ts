import { AppError } from './errors';
import { canMove, type OrderStatus } from './order-status';

export const ORDER_CHANNELS = ['COUNTER', 'DELIVERY_PLATFORM'] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const ORDER_RULES = {
  maxCustomerName: 80,
  maxItems: 30,
  maxQuantity: 99,
} as const;

/** Paid on delivery (or at the counter). Platform orders are paid on the platform and have none. */
export const PAYMENT_METHODS = ['CASH', 'PIX', 'CARD'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type OrderItem = {
  sku: string;
  name: string;
  quantity: number;
  /** Sale price in cents, copied from the stock when the order was placed; null when unknown. */
  unitPrice: number | null;
};

/** An item as callers hand it in; the price is optional (platform orders send none). */
export type NewOrderItem = Omit<OrderItem, 'unitPrice'> & { unitPrice?: number | null };

/** Sum in cents, or null when any item has no price. */
export function orderTotal(items: readonly OrderItem[]): number | null {
  let total = 0;
  for (const item of items) {
    if (item.unitPrice === null) return null;
    total += item.unitPrice * item.quantity;
  }
  return total;
}

export type DeliveryAddress = {
  cep: string;
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
};

export type OrderProps = {
  id: string;
  /** Short daily number shown on screens; the repository assigns it, unique per day. */
  number: number;
  customerName: string;
  channel: OrderChannel;
  items: OrderItem[];
  delivery: DeliveryAddress | null;
  status: OrderStatus;
  /** Increases on every change; the repository uses it for optimistic locking. */
  version: number;
  statusChangedAt: Date;
  /** Set when the order stayed in PREPARING too long; cleared by the next move. */
  lateSince: Date | null;
  /** Id from the delivery platform, unique with `channel`. */
  externalId: string | null;
  /** The CUSTOMER account that placed the order; null for staff and platform orders. */
  customerId: string | null;
  paymentMethod: PaymentMethod | null;
  /** Cents the customer will pay with in cash, so the driver brings change; CASH only. */
  changeFor: number | null;
  createdAt: Date;
};

export type CreateOrderInput = {
  id: string;
  number: number;
  customerName: string;
  channel: OrderChannel;
  items: NewOrderItem[];
  delivery?: DeliveryAddress | null;
  externalId?: string | null;
  customerId?: string | null;
  paymentMethod?: PaymentMethod | null;
  changeFor?: number | null;
  now: Date;
};

/** Order rules live here, not in the controller or the database. */
export class Order {
  private constructor(private readonly props: OrderProps) {}

  static create(input: CreateOrderInput): Order {
    const customerName = input.customerName.trim();
    if (customerName.length === 0 || customerName.length > ORDER_RULES.maxCustomerName) {
      throw new AppError('CUSTOMER_NAME_INVALID', { max: ORDER_RULES.maxCustomerName });
    }

    const items = validItems(input.items);
    const delivery = input.delivery ? validDelivery(input.delivery) : null;

    const externalId = input.externalId?.trim() || null;
    if (input.channel === 'DELIVERY_PLATFORM' && !externalId) {
      throw new AppError('EXTERNAL_ID_REQUIRED');
    }

    const paymentMethod = input.paymentMethod ?? null;
    const changeFor = input.changeFor ?? null;
    const total = orderTotal(items);
    if (
      changeFor !== null &&
      (paymentMethod !== 'CASH' ||
        !Number.isInteger(changeFor) ||
        changeFor <= 0 ||
        (total !== null && changeFor < total))
    ) {
      throw new AppError('CHANGE_FOR_INVALID');
    }

    return new Order({
      id: input.id,
      number: input.number,
      customerName,
      channel: input.channel,
      items,
      delivery,
      status: 'RECEIVED',
      version: 1,
      statusChangedAt: input.now,
      lateSince: null,
      externalId,
      customerId: input.customerId ?? null,
      paymentMethod,
      changeFor,
      createdAt: input.now,
    });
  }

  static restore(props: OrderProps): Order {
    return new Order({
      ...props,
      items: props.items.map((item) => ({ ...item })),
      delivery: props.delivery ? { ...props.delivery } : null,
    });
  }

  get id(): string {
    return this.props.id;
  }

  get number(): number {
    return this.props.number;
  }

  get customerName(): string {
    return this.props.customerName;
  }

  get channel(): OrderChannel {
    return this.props.channel;
  }

  get items(): readonly OrderItem[] {
    return this.props.items;
  }

  get delivery(): DeliveryAddress | null {
    return this.props.delivery;
  }

  get status(): OrderStatus {
    return this.props.status;
  }

  get version(): number {
    return this.props.version;
  }

  get statusChangedAt(): Date {
    return this.props.statusChangedAt;
  }

  get lateSince(): Date | null {
    return this.props.lateSince;
  }

  get externalId(): string | null {
    return this.props.externalId;
  }

  get customerId(): string | null {
    return this.props.customerId;
  }

  get paymentMethod(): PaymentMethod | null {
    return this.props.paymentMethod;
  }

  get changeFor(): number | null {
    return this.props.changeFor;
  }

  get total(): number | null {
    return orderTotal(this.props.items);
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** A customer may cancel only an order of their own that nobody started preparing yet. */
  canBeCancelledBy(customerId: string): boolean {
    return this.props.customerId === customerId && this.props.status === 'RECEIVED';
  }

  /**
   * `expectedVersion` is the version the caller saw. An older one means someone else moved the
   * order first. The repository repeats this check in the database to decide real races.
   */
  moveTo(to: OrderStatus, expectedVersion: number, now: Date): void {
    if (expectedVersion !== this.props.version) {
      throw new AppError('ORDER_CHANGED');
    }

    const from = this.props.status;
    if (!canMove(from, to)) {
      throw new AppError('STATUS_MOVE_INVALID', { from, to });
    }

    this.props.status = to;
    this.props.version += 1;
    this.props.statusChangedAt = now;
    this.props.lateSince = null;
  }

  /**
   * Flags an order that is still PREPARING at the version the late timer was started for.
   * Returns false (and changes nothing) when it has moved on since, or is already late.
   * Does not bump the version: being late is not a move, and staff can still move it.
   */
  markLate(startedAtVersion: number, now: Date): boolean {
    const stillWaiting =
      this.props.status === 'PREPARING' && this.props.version === startedAtVersion;
    if (!stillWaiting || this.props.lateSince) {
      return false;
    }
    this.props.lateSince = now;
    return true;
  }
}

function validItems(input: NewOrderItem[]): OrderItem[] {
  const items = input.map((item) => ({
    sku: item.sku.trim().toUpperCase(),
    name: item.name.trim(),
    quantity: item.quantity,
    unitPrice: item.unitPrice ?? null,
  }));

  const isValid = (item: OrderItem) =>
    item.sku.length > 0 &&
    item.name.length > 0 &&
    Number.isInteger(item.quantity) &&
    item.quantity >= 1 &&
    item.quantity <= ORDER_RULES.maxQuantity &&
    (item.unitPrice === null || (Number.isInteger(item.unitPrice) && item.unitPrice >= 0));

  if (items.length === 0 || items.length > ORDER_RULES.maxItems || !items.every(isValid)) {
    throw new AppError('ITEMS_INVALID', {
      maxItems: ORDER_RULES.maxItems,
      maxQuantity: ORDER_RULES.maxQuantity,
    });
  }

  return items;
}

export function validDelivery(input: DeliveryAddress): DeliveryAddress {
  const cep = input.cep.trim();
  if (!/^\d{5}-?\d{3}$/.test(cep)) {
    throw new AppError('CEP_INVALID');
  }

  return {
    cep: cep.replace('-', ''),
    street: input.street.trim(),
    number: input.number.trim(),
    district: input.district.trim(),
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
  };
}

/** Orders have no complement field: it rides along with the number, as the delivery platform sends it. */
export function numberWithComplement(
  number: string,
  complement: string | null | undefined,
): string {
  const extra = complement?.trim();
  return extra ? `${number} - ${extra}` : number;
}
