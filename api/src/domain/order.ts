import { AppError } from './errors';
import { canMove, type OrderStatus } from './order-status';

export const ORDER_CHANNELS = ['COUNTER', 'DELIVERY_PLATFORM'] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const ORDER_RULES = {
  maxCustomerName: 80,
  maxItems: 30,
  maxQuantity: 99,
} as const;

export type OrderItem = {
  sku: string;
  name: string;
  quantity: number;
};

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
  /** Id from the delivery platform, unique with `channel`. */
  externalId: string | null;
  createdAt: Date;
};

export type CreateOrderInput = {
  id: string;
  number: number;
  customerName: string;
  channel: OrderChannel;
  items: OrderItem[];
  delivery?: DeliveryAddress | null;
  externalId?: string | null;
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
      externalId,
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

  get externalId(): string | null {
    return this.props.externalId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
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
  }
}

function validItems(input: OrderItem[]): OrderItem[] {
  const items = input.map((item) => ({
    sku: item.sku.trim().toUpperCase(),
    name: item.name.trim(),
    quantity: item.quantity,
  }));

  const isValid = (item: OrderItem) =>
    item.sku.length > 0 &&
    item.name.length > 0 &&
    Number.isInteger(item.quantity) &&
    item.quantity >= 1 &&
    item.quantity <= ORDER_RULES.maxQuantity;

  if (items.length === 0 || items.length > ORDER_RULES.maxItems || !items.every(isValid)) {
    throw new AppError('ITEMS_INVALID', {
      maxItems: ORDER_RULES.maxItems,
      maxQuantity: ORDER_RULES.maxQuantity,
    });
  }

  return items;
}

function validDelivery(input: DeliveryAddress): DeliveryAddress {
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
