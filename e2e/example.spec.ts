import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

test('Application launches successfully', async () => {
  const electronApp = await electron.launch({
    args: [path.join(__dirname, '../out/main/index.js')]
  });

  const isPackaged = await electronApp.evaluate(async ({ app }) => {
    return app.isPackaged;
  });

  expect(isPackaged).toBe(false);

  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  const title = await window.title();
  expect(title).toBeTruthy();

  await electronApp.close();
});
