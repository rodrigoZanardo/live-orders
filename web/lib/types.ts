// Shapes the API returns (see the Swagger at /docs). Shared by server code and client components.

export const ROLES = ['ADMIN', 'STAFF', 'VIEWER', 'CUSTOMER'] as const;
export type Role = (typeof ROLES)[number];
/** Roles an admin can give; customers only come from the public sign-up. */
export const STAFF_ROLES = ['ADMIN', 'STAFF', 'VIEWER'] as const;

/** Where a role lands after sign-in: customers at the parts counter, everyone else at the board. */
export function homeOf(role: string | undefined | null): string {
  return role === 'CUSTOMER' ? '/cliente' : '/gerencia';
}

export const ORDER_STATUSES = ['RECEIVED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderChannel = 'COUNTER' | 'DELIVERY_PLATFORM';
export type EventType = 'ORDER_CREATED' | 'ORDER_STATUS_CHANGED' | 'ORDER_LATE';

/** `unitPrice` in cents, a snapshot of the stock price when the order was placed (API responses only). */
export type OrderItem = { sku: string; name: string; quantity: number; unitPrice?: number | null };

/** Paid on delivery (or at the counter); platform orders have none. */
export const PAYMENT_METHODS = ['CASH', 'PIX', 'CARD'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type Payment = { paymentMethod: PaymentMethod; changeFor?: number };

export type DeliveryAddress = {
  cep: string;
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
};

export type Order = {
  id: string;
  number: number;
  customerName: string;
  channel: OrderChannel;
  items: OrderItem[];
  /** Cents; null when any item has no price. */
  total: number | null;
  paymentMethod: PaymentMethod | null;
  changeFor: number | null;
  delivery: DeliveryAddress | null;
  status: OrderStatus;
  version: number;
  statusChangedAt: string;
  lateSince: string | null;
  externalId: string | null;
  createdAt: string;
};

export type OrderEvent = {
  seq: number;
  type: EventType;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  version: number;
  actorEmail: string;
  createdAt: string;
};

export type EventWithOrder = OrderEvent & { order: Order };

export type OrderDetail = Order & { events: OrderEvent[] };

export type User = { id: string; email: string; role: Role };

export type Subscription = { id: string; url: string; active: boolean; createdAt: string };

export type DeliveryStatus = 'PENDING' | 'SENT' | 'FAILED';

export type Delivery = {
  id: string;
  subscriptionId: string;
  url: string;
  eventSeq: number;
  eventType: EventType;
  status: DeliveryStatus;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
};

export type ErrorParams = Record<string, string | number>;

/** Why the API refused: a code to translate, its values, and the English fallback. */
export type ApiFailure = { code?: string; params?: ErrorParams; message: string };

/** The moves staff can make from each status, in button order (the API enforces the same rule). */
export const NEXT_MOVES: Record<OrderStatus, readonly OrderStatus[]> = {
  RECEIVED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

/** A product as the stock service lists it (GET /products of services/stock). */
/** `available` = quantity minus what open orders reserved; absent on older Stock Manager versions. */
/** `location` = bin address in the warehouse (e.g. R01-B03-A04-P060-N1); staff only, never sent to customers. */
export type StockProduct = {
  sku: string;
  name: string;
  quantity: number;
  available?: number;
  location?: string | null;
  /** Sale price in cents; absent on older Stock Manager versions, null when unset. */
  price?: number | null;
};

/** What the customer screen gets: the quantity only for staff and admin, otherwise the key is absent. */
/** `price` (cents) is public: everyone sees it, anonymous visitors too. */
export type ShopProduct = {
  sku: string;
  name: string;
  inStock: boolean;
  price: number | null;
  quantity?: number;
};
