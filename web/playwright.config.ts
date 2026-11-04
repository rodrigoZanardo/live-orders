import { defineConfig } from '@playwright/test';

// The specs run against a running stack (`npm start` at the root, or API + web started by hand).
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:3000', locale: 'en-US' },
});
