import { test, expect } from '@playwright/test';
import { launchElectronApp } from './helpers/launcher';

test('Application launches successfully', async () => {
  const { app, page } = await launchElectronApp();

  const isPackaged = await app.evaluate(async ({ app }) => {
    return app.isPackaged;
  });

  expect(isPackaged).toBe(false);

  const title = await page.title();
  expect(title).toBeTruthy();

  await app.close();
});
