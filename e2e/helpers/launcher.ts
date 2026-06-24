import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'path';

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
}

/**
 * Robustly launches the production-built Electron application.
 * Reusable across all E2E specs to ensure unified bootstrap parameters.
 */
export async function launchElectronApp(): Promise<LaunchedApp> {
  const mainPath = path.join(__dirname, '../../out/main/index.js');
  
  const app = await electron.launch({
    args: [mainPath],
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  return { app, page };
}
