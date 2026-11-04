import { createHmac, randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';

// Same values as the stack under test (see .env.example / docker-compose.yml).
const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const ADMIN = {
  email: process.env.ADMIN_EMAIL ?? 'admin@example.com',
  password: process.env.ADMIN_PASSWORD ?? 'admin-password',
};
const WEBHOOK_SECRET = process.env.WEBHOOK_INCOMING_SECRET ?? 'dev-incoming';

async function signedInPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  // wait for hydration: a click before it would submit the form natively (docs/HANDOFF.md)
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: "Today's orders" })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Live' })).toBeVisible();
  return page;
}

async function createOrder(customerName: string): Promise<number> {
  const login = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN),
  });
  const { token } = await login.json();
  const created = await fetch(`${API_URL}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      customerName,
      items: [{ sku: 'E2E-1', name: 'Test burger', quantity: 1 }],
    }),
  });
  return (await created.json()).order.number;
}

function card(page: Page, number: number) {
  return page
    .locator('article')
    .filter({ has: page.getByRole('link', { name: `Details of order #${number}` }) });
}

function column(page: Page, name: string) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name, exact: false, level: 2 }) });
}

test('a move on one board shows on another board within 2 seconds', async ({ browser }) => {
  const kitchen = await signedInPage(browser);
  const counter = await signedInPage(browser);
  const number = await createOrder(`E2E ${randomUUID().slice(0, 6)}`);

  // the new order reaches both boards without a reload
  await expect(card(counter, number)).toBeVisible();
  await expect(card(kitchen, number)).toBeVisible();

  await card(kitchen, number)
    .getByRole('button', { name: `Start order #${number}` })
    .click();

  await expect(
    column(counter, 'Preparing')
      .locator('article')
      .filter({ hasText: `#${number}` }),
  ).toBeVisible({
    timeout: 2000,
  });
});

test('an order from the delivery platform webhook appears on the board', async ({ browser }) => {
  const board = await signedInPage(browser);
  const externalId = `e2e-${randomUUID().slice(0, 8)}`;
  const body = JSON.stringify({
    externalId,
    customerName: 'Webhook Wanda',
    items: [{ sku: 'KB-001', name: 'Keyboard', quantity: 1 }],
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex')}`;

  const response = await fetch(`${API_URL}/webhooks/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Timestamp': timestamp,
      'X-Signature': signature,
      'Idempotency-Key': randomUUID(),
    },
    body,
  });
  expect(response.status).toBe(201);
  const { number } = await response.json();

  await expect(card(board, number)).toContainText('Webhook Wanda');
  await expect(card(board, number)).toContainText('Platform');
});

test('switching to Portuguese translates the board', async ({ browser }) => {
  const page = await signedInPage(browser);
  await page.getByRole('button', { name: 'Português' }).click();
  await expect(page.getByRole('heading', { name: 'Pedidos de hoje' })).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: "Today's orders" })).toBeVisible();
});

test('an expired session goes back to sign in instead of looping', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addCookies([
    { name: 'token', value: 'expired-or-forged', url: 'http://localhost:3000' },
  ]);
  const page = await context.newPage();
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
