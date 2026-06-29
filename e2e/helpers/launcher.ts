import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'path';

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
}

let currentUserDataDir: string | null = null;

/**
 * Robustly launches the production-built Electron application.
 * Reusable across all E2E specs to ensure unified bootstrap parameters.
 */
export interface LaunchOptions {
  cleanState?: boolean;
  disableDefaultTab?: boolean;
}

export async function launchElectronApp(options: LaunchOptions = {}): Promise<LaunchedApp> {
  const cleanState = options.cleanState ?? true;
  const disableDefaultTab = options.disableDefaultTab ?? false;
  const mainPath = path.join(__dirname, '../../out/main/index.js');
  
  if (cleanState || !currentUserDataDir) {
    currentUserDataDir = path.join(__dirname, '../../test-results/user-data-' + Math.random().toString(36).substring(7));
  }
  
  const env: Record<string, string> = {
    ...process.env,
    ULTRA_GIT_TESTING: 'true'
  };

  if (disableDefaultTab) {
    env.ULTRA_GIT_DISABLE_DEFAULT_TAB = 'true';
  }
  
  const app = await electron.launch({
    args: [mainPath, '--no-sandbox', `--user-data-dir=${currentUserDataDir}`],
    env
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  if (cleanState) {
    await page.evaluate((disable) => {
      localStorage.clear();
      if (disable) {
        localStorage.setItem('disable-default-tab', 'true');
      }
    }, disableDefaultTab);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  }

  return { app, page };
}
