import { _electron as electron } from '@playwright/test';
import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// Path to the Electron binary when the `electron` package is required from Node.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const electronBinary = require('electron') as string;

const mainPath = path.join(__dirname, '../out/main/index.js');
const getDataDir = (suffix: string) =>
  path.join(__dirname, `../test-results/user-data/single-instance-${suffix}`);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Launch Electron WITHOUT `--no-lock` so the real single-instance lock
 * is exercised. Returns the app and its first window.
 */
async function launchApp(userDataDir: string) {
  if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
  const app = await electron.launch({
    args: [mainPath, '--no-sandbox', `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ULTRA_GIT_TESTING: 'true' },
  });
  const window = await app.firstWindow();
  await window.waitForSelector('.app-container');
  return { app, window };
}

/**
 * Launch a second instance as a plain child process (no Playwright attach —
 * the process is expected to quit before a debugger could connect anyway)
 * and wait for it to exit on its own. Resolves with the exit code, or
 * rejects if the process is still alive after `timeoutMs` (which would mean
 * the single-instance lock did NOT reject it).
 */
function launchSecondAndWaitForExit(userDataDir: string, timeoutMs = 15_000): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      electronBinary,
      [mainPath, '--no-sandbox', `--user-data-dir=${userDataDir}`],
      { env: { ...process.env, ULTRA_GIT_TESTING: 'true' }, stdio: 'ignore' }
    );

    const killer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Second instance did not exit on its own — single-instance lock failed'));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(killer);
      reject(err);
    });

    child.on('exit', (code) => {
      clearTimeout(killer);
      resolve(code);
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Single Instance Lock', () => {

  test('second instance quits immediately while first keeps running', async () => {
    const userDataDir = getDataDir('basic');

    // First instance acquires the lock
    const first = await launchApp(userDataDir);
    const firstWindow = first.window;

    // The first instance has a single window.
    expect(await firstWindow.locator('.app-container').count()).toBe(1);

    // Launch a second instance against the same user-data-dir — it should
    // fail to acquire the lock and exit on its own (app.quit() → code 0).
    const exitCode = await launchSecondAndWaitForExit(userDataDir);
    expect(exitCode).toBe(0);

    // The first instance should still be running with its single window intact.
    expect(await firstWindow.locator('.app-container').count()).toBe(1);
    await expect(firstWindow.locator('.app-container')).toBeVisible();

    await first.app.close();
  });

  test('first instance is still functional after a second-instance attempt', async () => {
    const userDataDir = getDataDir('survives');
    const first = await launchApp(userDataDir);
    const firstWindow = first.window;

    // Launch a second instance — it will fail and exit
    const exitCode = await launchSecondAndWaitForExit(userDataDir);
    expect(exitCode).toBe(0);

    // The first instance must still respond in the main process...
    const version = await first.app.evaluate(({ app }) => app.getVersion());
    expect(version).toBeTruthy();

    // ...and to UI events: open the Add Repository dropdown in the TitleBar.
    const addBtn = firstWindow.locator('[data-testid="add-repo-btn"]');
    await expect(addBtn).toBeVisible();
    await addBtn.click();
    await expect(firstWindow.locator('[data-testid="recent-repos-dropdown"]')).toBeVisible();
    await firstWindow.keyboard.press('Escape');

    await first.app.close();
  });

  test('only one window is created when a second instance is launched', async () => {
    const userDataDir = getDataDir('single-window');
    const first = await launchApp(userDataDir);

    const windowsBefore = await first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    expect(windowsBefore).toBe(1);

    // Launch a second instance — it will be rejected by the lock and quit.
    const exitCode = await launchSecondAndWaitForExit(userDataDir);
    expect(exitCode).toBe(0);

    // The first instance must still have exactly one window (no extra window
    // is opened by the second-instance event).
    const windowsAfter = await first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    expect(windowsAfter).toBe(1);

    await first.app.close();
  });

  test('--no-lock flag bypasses the single-instance lock', async () => {
    const userDataDir = getDataDir('no-lock-bypass');

    // First instance — with --no-lock (used by all the other E2E specs that
    // need to launch multiple isolated instances in the same process tree)
    const first = await electron.launch({
      args: [mainPath, '--no-sandbox', `--user-data-dir=${userDataDir}`, '--no-lock'],
      env: { ...process.env, ULTRA_GIT_TESTING: 'true' },
    });
    const firstWindow = await first.firstWindow();
    await firstWindow.waitForSelector('.app-container');

    // Second instance — also with --no-lock
    const second = await electron.launch({
      args: [mainPath, '--no-sandbox', `--user-data-dir=${userDataDir}`, '--no-lock'],
      env: { ...process.env, ULTRA_GIT_TESTING: 'true' },
    });
    const secondWindow = await second.firstWindow();
    await secondWindow.waitForSelector('.app-container');

    // Both should be running concurrently (skipLock short-circuits the lock).
    await expect(firstWindow.locator('.app-container')).toBeVisible();
    await expect(secondWindow.locator('.app-container')).toBeVisible();

    await first.close();
    await second.close();
  });

});
