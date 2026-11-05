import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type {
  ApiFailure,
  Delivery,
  DeliveryAddress,
  DeliveryStatus,
  EventWithOrder,
  Order,
  OrderDetail,
  OrderItem,
  OrderStatus,
  Role,
  Subscription,
  User,
} from './types';
import { ROLES } from './types';

export const TOKEN_COOKIE = 'token';
export const ROLE_COOKIE = 'role';

/** Where the server reaches the API (inside docker: the service name). */
const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    readonly failure: ApiFailure,
    readonly status: number,
  ) {
    super(failure.message);
  }
}

/** Waits between tries while a sleeping free-tier API starts (about 40 s in total). */
const WAKE_DELAYS_MS = [2000, 3000, 5000, 8000, 10000, 10000];
const WAKING = new Set([502, 503, 504]);

type Init = { method?: string; body?: unknown };

/** Calls the API with the session token; throws ApiError with the API's error body on failure. */
async function request(path: string, init: Init = {}): Promise<Response> {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  const method = init.method ?? 'GET';
  const call = () =>
    fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });

  let response = await call();
  // only reads and login are retried: repeating a write after a 502 could apply it twice
  if (method === 'GET' || path === '/auth/login') {
    for (const delay of WAKE_DELAYS_MS) {
      if (!WAKING.has(response.status)) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
      response = await call();
    }
  }

  // expired session: back to sign in (login itself answers 401 as a normal error)
  if (response.status === 401 && !path.startsWith('/auth/')) redirect('/session-expired');
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => ({}));
    throw new ApiError(toFailure(body, response.status), response.status);
  }
  return response;
}

async function send<T>(path: string, init: Init = {}): Promise<T> {
  return (await request(path, init)).json();
}

async function sendNoContent(path: string, init: Init): Promise<void> {
  await request(path, init);
}

function toFailure(body: unknown, status: number): ApiFailure {
  if (
    typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    typeof body.message === 'string'
  ) {
    const code = 'code' in body && typeof body.code === 'string' ? body.code : undefined;
    const params =
      'params' in body && typeof body.params === 'object' && body.params !== null
        ? Object.fromEntries(
            Object.entries(body.params).filter(
              (entry): entry is [string, string | number] =>
                typeof entry[1] === 'string' || typeof entry[1] === 'number',
            ),
          )
        : undefined;
    return { code, params, message: body.message };
  }
  return { message: `HTTP ${status}` };
}

export const api = {
  login: (input: { email: string; password: string }) =>
    send<{ token: string; user: User }>('/auth/login', { method: 'POST', body: input }),

  register: (input: {
    name: string;
    email: string;
    password: string;
    address: DeliveryAddress & { complement?: string };
  }) => send<{ token: string; user: User }>('/auth/register', { method: 'POST', body: input }),
  myOrders: () => send<Order[]>('/my/orders'),
  placeMyOrder: (items: OrderItem[]) =>
    send<Order>('/my/orders', { method: 'POST', body: { items } }),
  cancelMyOrder: (id: string, version: number) =>
    send<Order>(`/my/orders/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: { version },
    }),

  lastSeq: () => send<{ lastSeq: number }>('/events/last'),
  events: (after: number) => send<EventWithOrder[]>(`/events?after=${after}`),
  liveTicket: () => send<{ ticket: string }>('/live/ticket', { method: 'POST' }),
  orders: (date?: string) => send<Order[]>(`/orders${date ? `?date=${date}` : ''}`),
  order: (id: string) => send<OrderDetail>(`/orders/${encodeURIComponent(id)}`),
  createOrder: (input: { customerName: string; items: OrderItem[]; delivery?: DeliveryAddress }) =>
    send<EventWithOrder>('/orders', { method: 'POST', body: input }),
  moveOrder: (id: string, input: { to: OrderStatus; version: number }) =>
    send<EventWithOrder>(`/orders/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: input,
    }),
  address: (cep: string) =>
    send<{ found: boolean; address?: Omit<DeliveryAddress, 'cep' | 'number'> }>(
      `/address/${encodeURIComponent(cep)}`,
    ),

  users: () => send<User[]>('/users'),
  createUser: (input: { email: string; password: string; role: Role }) =>
    send<User>('/users', { method: 'POST', body: input }),

  subscriptions: () => send<Subscription[]>('/webhook-subscriptions'),
  createSubscription: (url: string) =>
    send<Subscription & { secret: string }>('/webhook-subscriptions', {
      method: 'POST',
      body: { url },
    }),
  deleteSubscription: (id: string) =>
    sendNoContent(`/webhook-subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  deliveries: (status?: DeliveryStatus) =>
    send<Delivery[]>(`/webhook-deliveries${status ? `?status=${status}` : ''}`),
};

/** The signed-in user's role from the login cookie; only decides which buttons show (the API checks again). */
export async function currentRole(): Promise<Role | null> {
  const value = (await cookies()).get(ROLE_COOKIE)?.value;
  return ROLES.find((role) => role === value) ?? null;
}

/** API address as the browser sees it (may differ from API_URL inside docker). */
export function publicApiUrl(): string {
  return process.env.PUBLIC_API_URL ?? API_URL;
}
