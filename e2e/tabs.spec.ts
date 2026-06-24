import { test, expect } from '@playwright/test';
import { launchElectronApp } from './helpers/launcher';
import { GitSandbox } from './helpers/git-sandbox';
import path from 'path';

test.describe('Multi-Repo Tab System', () => {
  let sandbox: GitSandbox;

  test.beforeAll(async () => {
    // 1. Initialize a real, isolated Git repository for the E2E session
    sandbox = new GitSandbox();
    await sandbox.init();
    
    // Seed some commits and a custom branch so we can test the UI state updates
    await sandbox.createBranch('feature/e2e-tabs');
    await sandbox.createCommit('sample-code.js', 'console.log("hello");', 'Add sample code');
  });

  test.afterAll(async () => {
    // 2. Tear down the Git repository
    await sandbox.destroy();
  });

  test('should support the full multi-repo tab life-cycle (add, switch, render, close)', async () => {
    // 3. Launch the native Electron Application
    const { app, page } = await launchElectronApp();

    try {
      const expectedInitialTabName = path.basename(process.cwd());

      // 4. Verify initial default tab renders correctly
      const initialTabs = page.locator('[data-testid="repo-tab"]');
      await expect(initialTabs).toHaveCount(1);
      await expect(initialTabs.first()).toContainText(expectedInitialTabName);

      // 5. Mock the native dialog in the Electron Main process using Playwright evaluate
      await app.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory');
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath };
        });
      }, sandbox.dir);

      // 6. Click the Add Repository button
      const addBtn = page.locator('[data-testid="add-repo-btn"]');
      await expect(addBtn).toBeVisible();
      await addBtn.click();

      // 7. Verify the new tab is added successfully (and contains the sandbox directory's base name)
      const expectedTabName = path.basename(sandbox.dir);
      await expect(initialTabs).toHaveCount(2);
      await expect(initialTabs.last()).toContainText(expectedTabName);

      // 8. Click the new tab to switch context
      await initialTabs.last().click();

      // 9. Verify the sidebar updates to show the sandbox branch and status
      const sidebarActiveBranch = page.locator('[data-testid="sidebar-active-branch"]');
      await expect(sidebarActiveBranch).toBeVisible();
      await expect(sidebarActiveBranch).toContainText('feature/e2e-tabs');

      const sidebarBranchIndicator = page.locator('[data-testid="sidebar-branch-name"]');
      await expect(sidebarBranchIndicator).toContainText('feature/e2e-tabs');

      // 10. Close the newly added tab
      const closeBtn = initialTabs.last().locator('[data-testid="close-tab-btn"]');
      await closeBtn.click();

      // 11. Verify we are back to only 1 tab
      await expect(initialTabs).toHaveCount(1);
      await expect(initialTabs.first()).toContainText(expectedInitialTabName);

    } finally {
      // 12. Ensure clean app termination to avoid leaving zombie Electron processes
      await app.close();
    }
  });
});
