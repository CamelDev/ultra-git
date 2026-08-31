import { defineConfig, _electron as electron } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120000,
  fullyParallel: false,
  workers: 1,
  expect: {
    timeout: 10000
  },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: true,
  },
});
