import { defineConfig, _electron as electron } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  expect: {
    timeout: 5000
  },
  reporter: 'html',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'on',
  },
});
