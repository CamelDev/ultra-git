import { defineConfig, _electron as electron } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  fullyParallel: false,
  workers: process.env.CI ? 2 : 1,
  expect: {
    timeout: 5000
  },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
