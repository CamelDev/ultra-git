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
    const { app, page } = await launchElectronApp({ disableDefaultTab: true });

    try {
      const expectedInitialTabName = path.basename(process.cwd());

      // 4. Verify initial state has 0 tabs and landing page is visible
      const initialTabs = page.locator('[data-testid="repo-tab"]');
      await expect(initialTabs).toHaveCount(0);
      
      const landingPage = page.locator('[data-testid="landing-page"]');
      await expect(landingPage).toBeVisible();

      // 5. Mock the native dialog in the Electron Main process using Playwright evaluate
      await app.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory');
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath };
        });
      }, sandbox.dir);

      // 6. Click the Open Repository button on the landing page
      const landingOpenBtn = page.locator('[data-testid="landing-open-repo-btn"]');
      await expect(landingOpenBtn).toBeVisible();
      await landingOpenBtn.click();

      // 7. Verify the new tab is added successfully (and contains the sandbox directory's base name)
      const expectedTabName = path.basename(sandbox.dir);
      await expect(initialTabs).toHaveCount(1);
      await expect(initialTabs.first()).toContainText(expectedTabName);
      await expect(landingPage).not.toBeVisible();

      // 8. Now mock dialog to return process.cwd() and add it via TitleBar button
      await app.evaluate(async ({ ipcMain }, cwdPath) => {
        ipcMain.removeHandler('dialog:openDirectory');
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: cwdPath };
        });
      }, process.cwd());

      const addBtn = page.locator('[data-testid="add-repo-btn"]');
      await expect(addBtn).toBeVisible();
      await addBtn.click();

      const dropdownOpenBtn = page.locator('[data-testid="dropdown-open-repo-btn"]');
      await expect(dropdownOpenBtn).toBeVisible();
      await dropdownOpenBtn.click();

      // Verify we have 2 tabs now (sandbox and process.cwd())
      await expect(initialTabs).toHaveCount(2);
      await expect(initialTabs.last()).toContainText(expectedInitialTabName);

      // Click the first tab (sandbox) to switch context
      await initialTabs.first().click();
      await page.waitForTimeout(1000);

      // Verify the sidebar updates to show the sandbox branch and status
      const sidebarActiveBranch = page.locator('[data-testid="sidebar-active-branch"]');
      await expect(sidebarActiveBranch).toBeVisible();
      await expect(sidebarActiveBranch).toContainText('feature/e2e-tabs');

      // Close the second tab (process.cwd())
      const closeBtn = initialTabs.last().locator('[data-testid="close-tab-btn"]');
      await closeBtn.click();

      // Verify we are back to only 1 tab (sandbox)
      await expect(initialTabs).toHaveCount(1);
      await expect(initialTabs.first()).toContainText(expectedTabName);

    } finally {
      // 12. Ensure clean app termination to avoid leaving zombie Electron processes
      await app.close();
    }
  });

  test('should persist tabs on app reload/restart', async () => {
    // 1. Launch the native Electron Application
    const { app: app1, page: page1 } = await launchElectronApp({ disableDefaultTab: true });
    
    try {
      const expectedInitialTabName = path.basename(process.cwd());

      // Verify 0 tabs initially
      const initialTabs1 = page1.locator('[data-testid="repo-tab"]');
      await expect(initialTabs1).toHaveCount(0);

      // Mock dialog for sandbox
      await app1.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory');
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath };
        });
      }, sandbox.dir);

      // Click landing page open button to open sandbox
      const landingOpenBtn = page1.locator('[data-testid="landing-open-repo-btn"]');
      await expect(landingOpenBtn).toBeVisible();
      await landingOpenBtn.click();

      // Mock dialog for process.cwd()
      await app1.evaluate(async ({ ipcMain }, cwdPath) => {
        ipcMain.removeHandler('dialog:openDirectory');
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: cwdPath };
        });
      }, process.cwd());

      // Click the Add Repository button in TitleBar
      const addBtn = page1.locator('[data-testid="add-repo-btn"]');
      await expect(addBtn).toBeVisible();
      await addBtn.click();

      const dropdownOpenBtn = page1.locator('[data-testid="dropdown-open-repo-btn"]');
      await expect(dropdownOpenBtn).toBeVisible();
      await dropdownOpenBtn.click();

      // Verify both tabs are open
      const expectedTabName = path.basename(sandbox.dir);
      await expect(initialTabs1).toHaveCount(2);
      await expect(initialTabs1.first()).toContainText(expectedTabName);
      await expect(initialTabs1.last()).toContainText(expectedInitialTabName);

      // Switch to the sandbox tab
      await initialTabs1.first().click();

      // Close the first app instance
      await app1.close();

      // 2. Launch the Electron Application again (restart without clearing localStorage)
      const { app: app2, page: page2 } = await launchElectronApp({ cleanState: false });

      try {
        const initialTabs2 = page2.locator('[data-testid="repo-tab"]');
        
        // Both tabs should still be open!
        await expect(initialTabs2).toHaveCount(2);
        await expect(initialTabs2.first()).toContainText(expectedTabName);
        await expect(initialTabs2.last()).toContainText(expectedInitialTabName);

        // Wait for repo to finish loading
        await page2.waitForTimeout(1500);

        // The first tab should still be active, meaning its sidebar should show the sandbox branch
        const sidebarActiveBranch = page2.locator('[data-testid="sidebar-active-branch"]');
        await expect(sidebarActiveBranch).toBeVisible();
        await expect(sidebarActiveBranch).toContainText('feature/e2e-tabs');

      } finally {
        await app2.close();
      }

    } finally {
      try {
        await app1.close();
      } catch (e) {
        // Ignore if already closed
      }
    }
  });

  test('should support drag and drop reordering of tabs and preserve the custom order on restart', async () => {
    // 1. Launch the native Electron Application
    const { app: app1, page: page1 } = await launchElectronApp({ disableDefaultTab: true });
    
    try {
      const expectedInitialTabName = path.basename(process.cwd());

      // Verify 0 tabs initially
      const initialTabs1 = page1.locator('[data-testid="repo-tab"]');
      await expect(initialTabs1).toHaveCount(0);

      // Mock dialog for sandbox
      await app1.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory');
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath };
        });
      }, sandbox.dir);

      // Click landing page open button to open sandbox
      const landingOpenBtn = page1.locator('[data-testid="landing-open-repo-btn"]');
      await expect(landingOpenBtn).toBeVisible();
      await landingOpenBtn.click();

      // Mock dialog for process.cwd()
      await app1.evaluate(async ({ ipcMain }, cwdPath) => {
        ipcMain.removeHandler('dialog:openDirectory');
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: cwdPath };
        });
      }, process.cwd());

      // Click the Add Repository button in TitleBar
      const addBtn = page1.locator('[data-testid="add-repo-btn"]');
      await expect(addBtn).toBeVisible();
      await addBtn.click();

      const dropdownOpenBtn = page1.locator('[data-testid="dropdown-open-repo-btn"]');
      await expect(dropdownOpenBtn).toBeVisible();
      await dropdownOpenBtn.click();

      // Verify both tabs are open in initial order: [sandbox, process.cwd()]
      const expectedTabName = path.basename(sandbox.dir);
      await expect(initialTabs1).toHaveCount(2);
      await expect(initialTabs1.first()).toContainText(expectedTabName);
      await expect(initialTabs1.last()).toContainText(expectedInitialTabName);

      // Perform drag-and-drop from first tab to last tab
      await initialTabs1.first().dragTo(initialTabs1.last());
      await page1.waitForTimeout(500);

      // Verify they are reordered in the UI: [process.cwd(), sandbox]
      await expect(initialTabs1.first()).toContainText(expectedInitialTabName);
      await expect(initialTabs1.last()).toContainText(expectedTabName);

      // Close the first app instance
      await app1.close();

      // 2. Launch the Electron Application again (restart without clearing localStorage)
      const { app: app2, page: page2 } = await launchElectronApp({ cleanState: false });

      try {
        const initialTabs2 = page2.locator('[data-testid="repo-tab"]');
        
        // Both tabs should still be open in the reordered state!
        await expect(initialTabs2).toHaveCount(2);
        await expect(initialTabs2.first()).toContainText(expectedInitialTabName);
        await expect(initialTabs2.last()).toContainText(expectedTabName);

      } finally {
        await app2.close();
      }

    } finally {
      try {
        await app1.close();
      } catch (e) {
        // Ignore if already closed
      }
    }
  });

  test('should support tab customizations (custom name and color) and persist them across app restart', async () => {
    // 1. Launch the native Electron Application
    const { app: app1, page: page1 } = await launchElectronApp({ disableDefaultTab: true });

    try {
      // Mock dialog for sandbox
      await app1.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory');
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath };
        });
      }, sandbox.dir);

      // Click landing page open button to open sandbox
      const landingOpenBtn = page1.locator('[data-testid="landing-open-repo-btn"]');
      await expect(landingOpenBtn).toBeVisible();
      await landingOpenBtn.click();

      const tabs = page1.locator('[data-testid="repo-tab"]');
      await expect(tabs).toHaveCount(1);

      // Set custom tab name
      const setCustomNameBtn = tabs.first().locator('[data-testid="set-tab-name-btn"]');
      await expect(setCustomNameBtn).toBeVisible();
      await setCustomNameBtn.click();

      const renameInput = tabs.first().locator('[data-testid="tab-rename-input"]');
      await expect(renameInput).toBeVisible();
      await renameInput.fill('My Customized Sandbox');
      await renameInput.press('Enter');

      // Verify custom name is displayed
      await expect(tabs.first()).toContainText('My Customized Sandbox');

      // Set custom tab color
      const setCustomColorBtn = tabs.first().locator('[data-testid="set-tab-color-btn"]');
      await expect(setCustomColorBtn).toBeVisible();
      await setCustomColorBtn.click();

      const colorPopover = page1.locator('[data-testid="tab-color-popover"]');
      await expect(colorPopover).toBeVisible();

      const redSwatch = page1.locator('[data-testid="color-swatch-#ef4444"]');
      await expect(redSwatch).toBeVisible();
      await redSwatch.click();

      // Verify color dot is visible inside the tab
      const colorDot = tabs.first().locator('[data-testid="tab-color-dot"]');
      await expect(colorDot).toBeVisible();

      // Close the first app instance
      await app1.close();

      // 2. Launch app again (restart without clearing state)
      const { app: app2, page: page2 } = await launchElectronApp({ cleanState: false });

      try {
        const tabs2 = page2.locator('[data-testid="repo-tab"]');
        await expect(tabs2).toHaveCount(1);
        await expect(tabs2.first()).toContainText('My Customized Sandbox');

        const colorDot2 = tabs2.first().locator('[data-testid="tab-color-dot"]');
        await expect(colorDot2).toBeVisible();

      } finally {
        await app2.close();
      }

    } finally {
      try {
        await app1.close();
      } catch (e) {
        // Ignore if already closed
      }
    }
  });

  test('should display recent repositories dropdown, allow removing with trash icon, and handle opening', async () => {
    const { app, page } = await launchElectronApp({ disableDefaultTab: true });

    try {
      // Mock dialog to open sandbox
      await app.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory');
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath };
        });
      }, sandbox.dir);

      // Open sandbox from landing page
      const landingOpenBtn = page.locator('[data-testid="landing-open-repo-btn"]');
      await landingOpenBtn.click();

      // Close the tab so no tab is currently open, but sandbox is in recent repos
      const tabs = page.locator('[data-testid="repo-tab"]');
      await expect(tabs).toHaveCount(1);
      const closeBtn = tabs.first().locator('[data-testid="close-tab-btn"]');
      await closeBtn.click();
      await expect(tabs).toHaveCount(0);

      // Click "+" button to open recent repos dropdown
      const addBtn = page.locator('[data-testid="add-repo-btn"]');
      await addBtn.click();

      const dropdown = page.locator('[data-testid="recent-repos-dropdown"]');
      await expect(dropdown).toBeVisible();

      const dropdownOpenBtn = page.locator('[data-testid="dropdown-open-repo-btn"]');
      await expect(dropdownOpenBtn).toBeVisible();

      // Check that sandbox is listed in recent repos
      const recentItems = page.locator('[data-testid="recent-repo-item"]');
      await expect(recentItems).toHaveCount(1);
      const expectedTabName = path.basename(sandbox.dir);
      await expect(recentItems.first()).toContainText(expectedTabName);

      // Click recent repo item -> opens it as a tab
      await recentItems.first().click();
      await expect(tabs).toHaveCount(1);

      // Open dropdown again
      await addBtn.click();
      await expect(dropdown).toBeVisible();

      // Remove recent repo using trash icon
      const trashBtn = page.locator('[data-testid="remove-recent-repo-btn"]').first();
      await trashBtn.click();

      // Verify recent items list is now empty / displays placeholder
      const emptyNotice = page.locator('.recent-repos-empty');
      await expect(emptyNotice).toBeVisible();

    } finally {
      await app.close();
    }
  });
});
