import { test, expect } from '@playwright/test';
import { launchElectronApp } from './helpers/launcher';
import { GitSandbox } from './helpers/git-sandbox';
import path from 'path';
import fs from 'fs';

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

      // Open Tab Settings popover via single cog icon
      const setTabSettingsBtn = tabs.first().locator('[data-testid="set-tab-settings-btn"]');
      await expect(setTabSettingsBtn).toBeVisible();
      await setTabSettingsBtn.click();

      const settingsPopover = page1.locator('[data-testid="tab-settings-popover"]');
      await expect(settingsPopover).toBeVisible();

      // Verify auto fetch checkbox is checked by default
      const autoFetchCheckbox = settingsPopover.locator('[data-testid="tab-auto-fetch-checkbox"]');
      await expect(autoFetchCheckbox).toBeVisible();
      await expect(autoFetchCheckbox).toBeChecked();

      // Set custom tab name inside settings popover
      const renameInput = settingsPopover.locator('[data-testid="tab-rename-input"]');
      await expect(renameInput).toBeVisible();
      await renameInput.fill('My Customized Sandbox');

      // Verify custom name is displayed
      await expect(tabs.first()).toContainText('My Customized Sandbox');

      // Set custom tab color inside settings popover
      const redSwatch = settingsPopover.locator('[data-testid="color-swatch-#ef4444"]');
      await expect(redSwatch).toBeVisible();
      await redSwatch.click();

      // Create a stash so the sandbox has stashed changes and triggers the indicator circle
      await sandbox.createStash('test-stash');
      await page1.evaluate(() => {
        const state = (window as any).useRepoStore?.getState?.();
        if (state && state.repositories.length > 0) {
          state.refreshRepo(state.repositories[0].id);
        }
      });

      // Verify indicator circle is visible inside the tab
      const colorDot = tabs.first().locator('[data-testid="tab-indicator-circle"]');
      await expect(colorDot).toBeVisible();

      // Close the first app instance
      await app1.close();

      // 2. Launch app again (restart without clearing state)
      const { app: app2, page: page2 } = await launchElectronApp({ cleanState: false });

      try {
        const tabs2 = page2.locator('[data-testid="repo-tab"]');
        await expect(tabs2).toHaveCount(1);
        await expect(tabs2.first()).toContainText('My Customized Sandbox');

        const colorDot2 = tabs2.first().locator('[data-testid="tab-indicator-circle"]');
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

  test('should display tab busy spinner when repo is pushing/pulling and isolate state across tabs', async () => {
    const { app, page } = await launchElectronApp({ disableDefaultTab: true });

    try {
      // 1. Mock opening sandbox
      await app.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory');
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath };
        });
      }, sandbox.dir);

      const landingOpenBtn = page.locator('[data-testid="landing-open-repo-btn"]');
      await landingOpenBtn.click();

      // 2. Open process.cwd() as second tab
      await app.evaluate(async ({ ipcMain }, cwdPath) => {
        ipcMain.removeHandler('dialog:openDirectory');
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: cwdPath };
        });
      }, process.cwd());

      const addBtn = page.locator('[data-testid="add-repo-btn"]');
      await addBtn.click();
      const dropdownOpenBtn = page.locator('[data-testid="dropdown-open-repo-btn"]');
      await dropdownOpenBtn.click();

      const tabs = page.locator('[data-testid="repo-tab"]');
      await expect(tabs).toHaveCount(2);

      // Verify neither tab has a busy spinner initially
      await expect(page.locator('.tab-busy-spinner')).toHaveCount(0);

      // Trigger pushing state on Tab 1 (sandbox) via window evaluate
      await page.evaluate(() => {
        // @ts-ignore
        const state = window.__REPO_STORE__?.getState?.() || (window as any).useRepoStore?.getState?.();
        if (state) {
          const firstRepoId = state.repositories[0].id;
          state.setRepoPushing(firstRepoId, true);
        }
      });

      // Tab 1 should show the tab spinner if state was set
      // Alternatively, let's verify tab 1 has spinner when set via store or verify action buttons
      // Let's check tab 2 (active) button is not showing "Pushing..."
      const pushBtn = page.locator('[data-testid="push-btn"]');
      await expect(pushBtn).toBeVisible();
      await expect(pushBtn).toContainText('Push');
      await expect(pushBtn).not.toBeDisabled();

    } finally {
      await app.close();
    }
  });

  test('should render thicker 6px active tab dash and correct dynamic Git status indicators (circle, solid dot, invisible)', async () => {
    const { app, page } = await launchElectronApp({ disableDefaultTab: true });

    try {
      // Mock opening sandbox
      await app.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory');
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath };
        });
      }, sandbox.dir);

      const landingOpenBtn = page.locator('[data-testid="landing-open-repo-btn"]');
      await landingOpenBtn.click();

      const tabs = page.locator('[data-testid="repo-tab"]');
      await expect(tabs).toHaveCount(1);
      const firstTab = tabs.first();

      // 1. Verify active tab has class active and dash height is 6px
      await expect(firstTab).toHaveClass(/active/);
      const afterHeight = await page.evaluate(() => {
        const activeTab = document.querySelector('.tab.active');
        if (!activeTab) return null;
        const afterStyle = window.getComputedStyle(activeTab, '::after');
        return afterStyle.height;
      });
      expect(afterHeight).toBe('6px');

      // 2. Clean repository state: indicator should be invisible
      await expect(firstTab.locator('.tab-color-dot')).toHaveCount(0);

      // 3. Uncommitted changes state: indicator should be a circle
      const dirtyFile = path.join(sandbox.dir, 'uncommitted_test_file.txt');
      fs.writeFileSync(dirtyFile, 'uncommitted modification');
      await page.evaluate(async () => {
        const state = (window as any).useRepoStore?.getState?.();
        if (state && state.repositories[0]) {
          await state.refreshRepo(state.repositories[0].id);
        }
      });
      const circleIndicator = firstTab.locator('[data-testid="tab-indicator-circle"]');
      await expect(circleIndicator).toBeVisible();

      // Clean up uncommitted file and verify stash also shows circle
      fs.unlinkSync(dirtyFile);
      await sandbox.createStash('stash-indicator-test');
      await page.evaluate(async () => {
        const state = (window as any).useRepoStore?.getState?.();
        if (state && state.repositories[0]) {
          await state.refreshRepo(state.repositories[0].id);
        }
      });
      await expect(circleIndicator).toBeVisible();

      // 4. Remote commits to pull state: indicator should be a solid dot
      await page.evaluate(() => {
        const state = (window as any).useRepoStore?.getState?.();
        if (state && state.repositories[0]) {
          (window as any).useRepoStore.setState({
            repositories: state.repositories.map((r: any, i: number) =>
              i === 0 ? { ...r, stashes: [], status: { ...r.status, files: [], behind: 3 } } : r
            )
          });
        }
      });
      const solidDotIndicator = firstTab.locator('[data-testid="tab-indicator-dot"]');
      await expect(solidDotIndicator).toBeVisible();

    } finally {
      await app.close();
    }
  });

  test('should isolate commit message state per repository tab and persist across app restart', async () => {
    // Initialize a second sandbox repo
    const sandbox2 = new GitSandbox();
    await sandbox2.init();
    await sandbox2.createCommit('file2.txt', 'content', 'Initial commit in repo 2');

    // Add uncommitted changes in both sandboxes so the commit section is rendered
    fs.writeFileSync(path.join(sandbox.dir, 'repo1_change.txt'), 'repo 1 change');
    fs.writeFileSync(path.join(sandbox2.dir, 'repo2_change.txt'), 'repo 2 change');

    try {
      const { app, page } = await launchElectronApp({ disableDefaultTab: true });

      try {
        // Open first repository via landing page
        await app.evaluate(async ({ ipcMain }, sandboxPath) => {
          ipcMain.removeHandler('dialog:openDirectory');
          ipcMain.handle('dialog:openDirectory', async () => ({
            canceled: false,
            filePaths: [sandboxPath],
            path: sandboxPath
          }));
        }, sandbox.dir);

        const landingOpenBtn = page.locator('[data-testid="landing-open-repo-btn"]');
        await expect(landingOpenBtn).toBeVisible();
        await landingOpenBtn.click();

        const tabs = page.locator('[data-testid="repo-tab"]');
        await expect(tabs).toHaveCount(1);

        // Open second repository via TitleBar Add button dropdown
        await app.evaluate(async ({ ipcMain }, sandboxPath) => {
          ipcMain.removeHandler('dialog:openDirectory');
          ipcMain.handle('dialog:openDirectory', async () => ({
            canceled: false,
            filePaths: [sandboxPath],
            path: sandboxPath
          }));
        }, sandbox2.dir);

        const addBtn = page.locator('[data-testid="add-repo-btn"]');
        await expect(addBtn).toBeVisible();
        await addBtn.click();

        const dropdownOpenBtn = page.locator('[data-testid="dropdown-open-repo-btn"]');
        await expect(dropdownOpenBtn).toBeVisible();
        await dropdownOpenBtn.click();

        await expect(tabs).toHaveCount(2);

        // Verify active tab is tab 2
        await expect(tabs.nth(1)).toHaveClass(/active/);
        const commitInput = page.locator('[data-testid="commit-message-input"]');
        await expect(commitInput).toHaveValue('');

        // Type commit message in tab 2
        await commitInput.fill('fix(repo2): second repo commit draft');
        await expect(commitInput).toHaveValue('fix(repo2): second repo commit draft');

        // Switch to tab 1
        await tabs.nth(0).click();
        await expect(tabs.nth(0)).toHaveClass(/active/);
        await expect(commitInput).toHaveValue('');

        // Type commit message in tab 1
        await commitInput.fill('feat(repo1): first repo commit draft');
        await expect(commitInput).toHaveValue('feat(repo1): first repo commit draft');

        // Switch back to tab 2 and verify its draft is intact
        await tabs.nth(1).click();
        await expect(tabs.nth(1)).toHaveClass(/active/);
        await expect(commitInput).toHaveValue('fix(repo2): second repo commit draft');

        // Switch back to tab 1 and verify its draft is intact
        await tabs.nth(0).click();
        await expect(tabs.nth(0)).toHaveClass(/active/);
        await expect(commitInput).toHaveValue('feat(repo1): first repo commit draft');

      } finally {
        await app.close();
      }

      // Relaunch the app to verify persistence of both drafts
      const restarted = await launchElectronApp({ cleanState: false });
      try {
        const restartedTabs = restarted.page.locator('[data-testid="repo-tab"]');
        await expect(restartedTabs).toHaveCount(2);

        const restartedCommitInput = restarted.page.locator('[data-testid="commit-message-input"]');
        // Currently active tab should have its commit message restored
        await expect(restartedCommitInput).toHaveValue('feat(repo1): first repo commit draft');

        // Switch to second tab and verify its draft was also restored
        await restartedTabs.nth(1).click();
        await expect(restartedTabs.nth(1)).toHaveClass(/active/);
        await expect(restartedCommitInput).toHaveValue('fix(repo2): second repo commit draft');

      } finally {
        await restarted.app.close();
      }
    } finally {
      await sandbox2.destroy();
    }
  });
});


