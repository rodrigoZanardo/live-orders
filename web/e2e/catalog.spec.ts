import { expect, test } from '@playwright/test';

// Same values as the stack under test (see .env.example / docker-compose.yml).
const ADMIN = {
  email: process.env.ADMIN_EMAIL ?? 'admin@example.com',
  password: process.env.ADMIN_PASSWORD ?? 'admin-password',
};

test('staff places a counter order from the parts list', async ({ page }) => {
  await page.goto('/login');
  // wait for hydration: a click before it would submit the form natively (docs/HANDOFF.md)
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: "Today's orders" })).toBeVisible();

  await page.goto('/cliente');
  await page.waitForLoadState('networkidle');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'BRG-01' })
    .getByRole('button', { name: 'Add' })
    .click();
  await page.getByLabel('Customer name').fill('E2E counter');
  await page.getByRole('button', { name: 'Send order' }).click();
  await expect(page.getByText(/Order #\d+ created\./)).toBeVisible();
});
