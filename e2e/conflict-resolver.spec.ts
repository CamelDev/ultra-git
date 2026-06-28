import { test, expect } from '@playwright/test';
import { launchElectronApp } from './helpers/launcher';
import { GitSandbox } from './helpers/git-sandbox';
import path from 'path';
import fs from 'fs';

test.describe('Interactive Conflict Resolver', () => {
  let sandbox: GitSandbox;

  test.beforeEach(async () => {
    sandbox = new GitSandbox();
    await sandbox.init();
    await sandbox.git.branch(['-M', 'main']);
    
    // Configure user identity
    await sandbox.git.addConfig('user.name', 'Test User', false, 'local');
    await sandbox.git.addConfig('user.email', 'test@example.com', false, 'local');
    
    // Create base commit
    await sandbox.createCommit('conflict.txt', 'Line 1\nBase content\nLine 3\n', 'Base commit');
    
    // Create branch-a modifying the file
    await sandbox.createBranch('branch-a');
    await sandbox.createCommit('conflict.txt', 'Line 1\nBranch A modification\nLine 3\n', 'Branch A modifications');
    
    // Switch back to main and create branch-b modifying the same file
    await sandbox.checkoutBranch('main');
    await sandbox.createBranch('branch-b');
    await sandbox.createCommit('conflict.txt', 'Line 1\nBranch B modification\nLine 3\n', 'Branch B modifications');
  });

  test.afterEach(async () => {
    await sandbox.destroy();
  });

  test('should support resolving conflicts hunk-by-hunk and committing the resolution', async () => {
    console.log('[Test 1] Launching Electron...');
    const { app, page } = await launchElectronApp();

    // Listen for browser logs and page errors
    page.on('console', msg => console.log('  [BROWSER CONSOLE]', msg.text()));
    page.on('pageerror', err => console.error('  [BROWSER ERROR]', err.message));

    try {
      console.log('[Test 1] Clearing localStorage...');
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);

      console.log('[Test 1] Mocking directory picker...');
      await app.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory');
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath };
        });
      }, sandbox.dir);

      console.log('[Test 1] Adding repository...');
      const addBtn = page.locator('[data-testid="add-repo-btn"]');
      await expect(addBtn).toBeVisible();
      await addBtn.click();

      console.log('[Test 1] Switching to repository tab...');
      const tabs = page.locator('[data-testid="repo-tab"]');
      await expect(tabs).toHaveCount(2);
      await tabs.last().click();
      await page.waitForTimeout(1000);

      console.log('[Test 1] Verifying branch...');
      const activeBranch = page.locator('[data-testid="sidebar-active-branch"]');
      await expect(activeBranch).toContainText('branch-b');

      console.log('[Test 1] Hovering branch-a and clicking Merge...');
      const branchAItem = page.locator('[data-testid="sidebar-branch-branch-a"]');
      await expect(branchAItem).toBeVisible();
      await branchAItem.hover();

      const mergeBtn = page.locator('[data-testid="merge-branch-btn-branch-a"]');
      await expect(mergeBtn).toBeVisible();
      await mergeBtn.click();

      console.log('[Test 1] Confirming merge in modal...');
      const mergeModal = page.locator('.diff-modal-overlay');
      await expect(mergeModal).toBeVisible();
      await page.waitForTimeout(500);

      const confirmMergeBtn = mergeModal.locator('[data-testid="confirm-merge-btn"]');
      await confirmMergeBtn.click();

      console.log('[Test 1] Verifying conflict banner...');
      await expect(mergeModal).toBeHidden();
      await page.waitForTimeout(500);

      const conflictBanner = page.locator('[data-testid="pull-conflict-banner"]');
      await expect(conflictBanner).toBeVisible();
      await expect(conflictBanner).toContainText('Merge conflicts detected in 1 file(s)');

      console.log('[Test 1] Verifying Conflict Resolver modal auto-opens...');
      const resolver = page.locator('[data-testid="conflict-resolver"]');
      await expect(resolver).toBeVisible();

      console.log('[Test 1] Dismissing (minimizing) Conflict Resolver...');
      const dismissBtn = page.locator('[data-testid="dismiss-conflict-resolver-btn"]');
      await expect(dismissBtn).toBeVisible();
      await dismissBtn.click();
      await expect(resolver).toBeHidden();

      console.log('[Test 1] Clicking Resolve Conflicts banner button...');
      const openResolverBtn = page.locator('[data-testid="open-conflict-resolver-btn"]');
      await expect(openResolverBtn).toBeVisible();
      await openResolverBtn.click();

      console.log('[Test 1] Verifying Conflict Resolver modal is reopened...');
      await expect(resolver).toBeVisible();

      console.log('[Test 1] Verifying conflict file in list...');
      const fileItem = page.locator('[data-testid="conflict-file-conflict.txt"]');
      await expect(fileItem).toBeVisible();
      await expect(fileItem).toContainText('conflict.txt');

      console.log('[Test 1] Verifying accept buttons...');
      const acceptOurs = page.locator('[data-testid="accept-ours-btn"]');
      const acceptTheirs = page.locator('[data-testid="accept-theirs-btn"]');
      const acceptBoth = page.locator('[data-testid="accept-both-btn"]');
      await expect(acceptOurs).toBeVisible();
      await expect(acceptTheirs).toBeVisible();
      await expect(acceptBoth).toBeVisible();

      console.log('[Test 1] Testing Theirs resolution...');
      await acceptTheirs.click();
      const resultPane = page.locator('[data-testid="conflict-result-preview"]');
      await expect(resultPane).toContainText('Branch A modification');

      console.log('[Test 1] Testing Both resolution...');
      await acceptBoth.click();
      await expect(resultPane).toContainText('Branch B modification');
      await expect(resultPane).toContainText('Branch A modification');

      console.log('[Test 1] Testing Ours resolution...');
      await acceptOurs.click();
      await expect(resultPane).toContainText('Branch B modification');

      console.log('[Test 1] Clicking Apply & Stage...');
      const applyBtn = page.locator('[data-testid="mark-resolved-btn"]');
      await expect(applyBtn).toBeEnabled();
      await applyBtn.click();
      await page.waitForTimeout(800);

      console.log('[Test 1] Verifying resolved file icon...');
      const fileItemIcon = fileItem.locator('.lucide-circle-check-big');
      await expect(fileItemIcon).toBeVisible();

      console.log('[Test 1] Clicking Commit Merge...');
      const completeBtn = page.locator('[data-testid="complete-merge-btn"]');
      await expect(completeBtn).toBeEnabled();
      await completeBtn.click();

      console.log('[Test 1] Verifying resolver modal is closed...');
      await expect(resolver).toBeHidden();
      await page.waitForTimeout(1000);

      console.log('[Test 1] Verifying final git sandbox state...');
      const gitStatus = await sandbox.git.status();
      expect(gitStatus.conflicted).toHaveLength(0);
      expect(gitStatus.files).toHaveLength(0);

      const log = await sandbox.git.log();
      expect(log.latest?.message).toContain('Merge commit');
      console.log('[Test 1] Finished successfully!');

    } finally {
      await app.close();
    }
  });

  test('should support aborting a merge conflict', async () => {
    const { app, page } = await launchElectronApp();

    // Listen for browser logs and page errors
    page.on('console', msg => console.log('  [BROWSER CONSOLE]', msg.text()));
    page.on('pageerror', err => console.error('  [BROWSER ERROR]', err.message));

    try {
      // Clear localStorage and reload
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);

      // Mock openDirectory dialog
      await app.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory');
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath };
        });
      }, sandbox.dir);

      // Add sandbox repository
      const addBtn = page.locator('[data-testid="add-repo-btn"]');
      await expect(addBtn).toBeVisible();
      await addBtn.click();

      // Switch to sandbox tab
      const tabs = page.locator('[data-testid="repo-tab"]');
      await expect(tabs).toHaveCount(2);
      await tabs.last().click();
      await page.waitForTimeout(1000);

      // Find branch-a in the sidebar, hover it, and click Merge
      const branchAItem = page.locator('[data-testid="sidebar-branch-branch-a"]');
      await expect(branchAItem).toBeVisible();
      await branchAItem.hover();

      const mergeBtn = page.locator('[data-testid="merge-branch-btn-branch-a"]');
      await expect(mergeBtn).toBeVisible();
      await mergeBtn.click();

      // Confirm merge in modal
      const mergeModal = page.locator('.diff-modal-overlay');
      await expect(mergeModal).toBeVisible();
      await page.waitForTimeout(500);

      const confirmMergeBtn = mergeModal.locator('[data-testid="confirm-merge-btn"]');
      await confirmMergeBtn.click();

      // Verify Conflict Resolver modal auto-opens
      const resolver = page.locator('[data-testid="conflict-resolver"]');
      await expect(resolver).toBeVisible();

      // Click Abort Merge
      const abortBtn = page.locator('[data-testid="abort-merge-btn"]');
      await expect(abortBtn).toBeVisible();
      await abortBtn.click();

      // Resolver should close
      await expect(resolver).toBeHidden();
      await page.waitForTimeout(1000);

      // Check git status to ensure merge was aborted and state is clean
      const gitStatus = await sandbox.git.status();
      expect(gitStatus.conflicted).toHaveLength(0);
      
      const log = await sandbox.git.log();
      expect(log.latest?.message).not.toContain('Merge commit');

    } finally {
      await app.close();
    }
  });
});
