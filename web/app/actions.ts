'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isLocale } from '@/i18n/locales';
import { api, ApiError, ROLE_COOKIE, TOKEN_COOKIE } from '@/lib/api';
import { homeOf } from '@/lib/types';
import type { ApiFailure, DeliveryAddress, OrderItem, OrderStatus, Role } from '@/lib/types';

export type ActionResult = { error?: ApiFailure };

const SESSION_SECONDS = 12 * 60 * 60; // matches the API token lifetime
const YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Turns an API refusal into a result the form can show; anything else is a bug and is rethrown. */
async function attempt<T>(fn: () => Promise<T>): Promise<ActionResult & { data?: T }> {
  try {
    return { data: await fn() };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.failure };
    throw error;
  }
}

export async function login(input: { email: string; password: string }): Promise<ActionResult> {
  return startSession(await attempt(() => api.login(input)));
}

/** Customer sign-up; the API signs the new account in, so it lands on the parts counter. */
export async function register(input: {
  name: string;
  email: string;
  password: string;
  address: DeliveryAddress & { complement?: string };
}): Promise<ActionResult> {
  return startSession(await attempt(() => api.register(input)));
}

async function startSession(
  result: ActionResult & { data?: { token: string; user: { role: Role } } },
): Promise<ActionResult> {
  if (!result.data) return { error: result.error };

  // https-only in production; COOKIE_SECURE=false allows a local http demo
  const secure = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production';
  const options = {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_SECONDS,
    path: '/',
  } as const;
  const jar = await cookies();
  jar.set(TOKEN_COOKIE, result.data.token, options);
  // the role only shows or hides buttons; the API checks the token on every call
  jar.set(ROLE_COOKIE, result.data.user.role, options);
  redirect(homeOf(result.data.user.role));
}

/** A customer orders for delivery to their saved address; the API takes name and address from the account. */
export async function placeMyOrder(
  items: OrderItem[],
): Promise<ActionResult & { number?: number }> {
  const result = await attempt(() => api.placeMyOrder(items));
  return { error: result.error, number: result.data?.number };
}

export async function cancelMyOrder(id: string, version: number): Promise<ActionResult> {
  const result = await attempt(() => api.cancelMyOrder(id, version));
  return { error: result.error };
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(TOKEN_COOKIE);
  jar.delete(ROLE_COOKIE);
  redirect('/login');
}

export async function setLocale(locale: string): Promise<void> {
  if (isLocale(locale))
    (await cookies()).set('locale', locale, { maxAge: YEAR_SECONDS, path: '/' });
  revalidatePath('/', 'layout');
}

export async function createOrder(input: {
  customerName: string;
  items: OrderItem[];
  delivery?: DeliveryAddress;
}): Promise<ActionResult & { number?: number }> {
  const result = await attempt(() => api.createOrder(input));
  return { error: result.error, number: result.data?.order.number };
}

/** The board updates itself from the WebSocket event, so nothing is revalidated here. */
export async function moveOrder(
  id: string,
  to: OrderStatus,
  version: number,
): Promise<ActionResult> {
  const result = await attempt(() => api.moveOrder(id, { to, version }));
  return { error: result.error };
}

/** Catch-up for the board: events after `after`, oldest first, at most 500. */
export async function catchUpEvents(after: number) {
  const result = await attempt(() => api.events(after));
  return { error: result.error, events: result.data };
}

/** Single-use ticket (30 s) that opens the WebSocket; the session token stays in the httpOnly cookie. */
export async function liveTicket() {
  const result = await attempt(() => api.liveTicket());
  return { error: result.error, ticket: result.data?.ticket };
}

export async function lookupAddress(cep: string) {
  const result = await attempt(() => api.address(cep));
  return { error: result.error, ...result.data };
}

export async function createUser(input: {
  email: string;
  password: string;
  role: Role;
}): Promise<ActionResult> {
  const result = await attempt(() => api.createUser(input));
  return { error: result.error };
}

export async function createSubscription(
  url: string,
): Promise<ActionResult & { secret?: string; url?: string }> {
  const result = await attempt(() => api.createSubscription(url));
  return { error: result.error, secret: result.data?.secret, url: result.data?.url };
}

export async function deleteSubscription(id: string): Promise<ActionResult> {
  const result = await attempt(() => api.deleteSubscription(id));
  return { error: result.error };
}
