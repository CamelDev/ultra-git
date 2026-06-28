import { test, expect } from '@playwright/test';
import { launchElectronApp } from './helpers/launcher';
import { GitSandbox } from './helpers/git-sandbox';
import path from 'path';
import fs from 'fs';

test.describe('Git Worktrees Integration', () => {
  let sandbox: GitSandbox;
  let wtPath: string;
  let wtPath2: string;
  let defaultBranch: string;

  test.beforeAll(async () => {
    // 1. Initialize a real, isolated Git repository for the E2E session
    sandbox = new GitSandbox();
    await sandbox.init();
    defaultBranch = await sandbox.git.revparse(['--abbrev-ref', 'HEAD']);
    
    // Seed some commits
    await sandbox.createCommit('first-file.txt', 'Hello', 'First commit');
    
    // Create a new branch for the worktree
    await sandbox.git.raw(['branch', 'feature/wt-test']);

    // Setup the worktree paths outside of the repo
    wtPath = path.join(sandbox.dir, '../', `wt-${path.basename(sandbox.dir)}`);
    wtPath2 = path.join(sandbox.dir, '../', `wt2-${path.basename(sandbox.dir)}`);
    
    // Create the actual git worktree
    await sandbox.git.raw(['worktree', 'add', wtPath, 'feature/wt-test']);
    
    // Add a commit inside the worktree to make it have distinct history/files
    const wtGit = require('simple-git')(wtPath);
    fs.writeFileSync(path.join(wtPath, 'wt-only-file.txt'), 'Worktree file content');
    await wtGit.add('wt-only-file.txt');
    await wtGit.commit('Commit in worktree');
  });

  test.afterAll(async () => {
    // Clean up worktree and directory
    try {
      await sandbox.git.raw(['worktree', 'prune']);
    } catch (e) {
      console.error('Failed to prune worktree', e);
    }
    
    // Delete worktree directories manually if they exist
    if (fs.existsSync(wtPath)) {
      try {
        fs.rmSync(wtPath, { recursive: true, force: true });
      } catch (e) {
        console.error('Failed to delete worktree dir', e);
      }
    }
    if (fs.existsSync(wtPath2)) {
      try {
        fs.rmSync(wtPath2, { recursive: true, force: true });
      } catch (e) {
        console.error('Failed to delete worktree dir 2', e);
      }
    }
    
    // Tear down the Git repository
    await sandbox.destroy();
  });

  test('should satisfy all worktree requirements: load in-place, hide worktree branch, and restrict branch actions', async () => {
    // Launch the Electron App
    const { app, page } = await launchElectronApp();

    try {
      // Mock openDirectory dialog to open our sandbox
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

      // Verify repo tab is added
      const tabs = page.locator('[data-testid="repo-tab"]');
      await expect(tabs).toHaveCount(2); // Initial default app tab + sandbox tab
      await tabs.last().click();

      // Check current active branch is the default branch
      const sidebarActiveBranch = page.locator('[data-testid="sidebar-active-branch"]');
      await expect(sidebarActiveBranch).toContainText(defaultBranch);

      // REQUIREMENT 1: "do not show work tree branches under normal branches, only under worktrees"
      // The branch checked out in the worktree ('feature/wt-test') should NOT be visible under the normal local branches list
      const wtBranchItem = page.locator('[data-testid="sidebar-branch-feature/wt-test"]');
      await expect(wtBranchItem).toBeHidden();

      // Verify the worktree section contains the worktree with correct branch
      const worktreeSection = page.locator('.sidebar-section:has-text("Worktree")');
      await expect(worktreeSection).toBeVisible();
      const worktreeItems = worktreeSection.locator('.sidebar-item');
      await expect(worktreeItems).toHaveCount(2); // Main repo + 1 extra worktree
      
      const parentWtItem = worktreeItems.first();
      const extraWtItem = worktreeItems.last();
      await expect(extraWtItem).toContainText('wt-sandbox-');
      await expect(extraWtItem).toContainText('feature/wt-test');

      // REQUIREMENT 2: "do not switch to another reop tab when worktree is selected - load it and show as normal branch in the same tab from the repo"
      // Click on the worktree item to switch to it
      await extraWtItem.click();

      // Wait a moment for state update and refresh
      await page.waitForTimeout(500);

      // Verify we DID NOT open a new tab (tab count stays at 2)
      await expect(tabs).toHaveCount(2);

      // Verify the active branch is hidden from local branches list
      await expect(sidebarActiveBranch).toBeHidden();

      // Verify that the worktrees list shows the extra worktree as active
      await expect(extraWtItem).toHaveClass(/active/);
      await expect(parentWtItem).not.toHaveClass(/active/);

      // REQUIREMENT 3: "do not allow creating branches from worktrees"
      // Verify branch creation buttons are disabled when inside a worktree
      const toolbarBranchBtn = page.locator('[data-testid="create-branch-btn"]');
      await expect(toolbarBranchBtn).toBeDisabled();

      const sidebarBranchBtn = page.locator('[data-testid="sidebar-create-branch-btn"]');
      await expect(sidebarBranchBtn).toBeHidden();

      const commitBranchBtn = page.locator('[data-testid^="commit-branch-btn-"]').first();
      await expect(commitBranchBtn).toBeDisabled();

      // REQUIREMENT 2 CONTINUED: Switch back to main repository from worktree using worktree list
      await parentWtItem.click();
      await page.waitForTimeout(500);

      // Verify active branch changed back to the default branch
      await expect(sidebarActiveBranch).toContainText(defaultBranch);
      await expect(parentWtItem).toHaveClass(/active/);
      await expect(extraWtItem).not.toHaveClass(/active/);

      // Verify branch actions are enabled again in main repository
      await expect(toolbarBranchBtn).not.toBeDisabled();
      await expect(sidebarBranchBtn).toBeVisible();
      await expect(sidebarBranchBtn).not.toBeDisabled();
      await expect(commitBranchBtn).not.toBeDisabled();

    } finally {
      await app.close();
    }
  });

  test('should support picking a base branch during worktree creation', async () => {
    const { app, page } = await launchElectronApp();

    try {
      // Mock openDirectory dialog to open our sandbox
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

      // Verify repo tab is added and switch to it
      const tabs = page.locator('[data-testid="repo-tab"]');
      await expect(tabs).toHaveCount(2);
      await tabs.last().click();

      // Wait for the repo to finish loading
      const sidebarActiveBranch = page.locator('[data-testid="sidebar-active-branch"]');
      await expect(sidebarActiveBranch).toContainText(defaultBranch);

      // Click "Add new worktree" button
      const addWtBtn = page.locator('[data-testid="add-worktree-btn"]');
      await expect(addWtBtn).toBeVisible();
      await addWtBtn.click();

      // Verify base branch selector is visible and defaults to the active branch (defaultBranch)
      const baseSelect = page.locator('[data-testid="worktree-base-branch-select"]');
      await expect(baseSelect).toBeVisible();
      await expect(baseSelect).toHaveValue(defaultBranch);

      // Select 'feature/wt-test' as base branch
      await baseSelect.selectOption('feature/wt-test');

      // Enter new branch name and path
      await page.locator('[data-testid="worktree-branch-input"]').fill('feature/wt-from-base');
      await page.locator('[data-testid="worktree-path-input"]').fill(wtPath2);

      // Click create submit button
      const submitBtn = page.locator('[data-testid="worktree-create-submit-btn"]');
      await expect(submitBtn).toBeEnabled();
      await submitBtn.click();

      // Wait a moment for worktree to create and UI to refresh
      await page.waitForTimeout(1000);

      // Verify the new worktree is visible in the list
      const worktreeSection = page.locator('.sidebar-section:has-text("Worktree")');
      await expect(worktreeSection).toBeVisible();
      const newWtItem = worktreeSection.locator('.sidebar-item').last();
      await expect(newWtItem).toContainText('wt2-sandbox-');
      await expect(newWtItem).toContainText('feature/wt-from-base');

      // Click to switch to the new worktree
      await newWtItem.click();
      await page.waitForTimeout(500);

      // Verify new worktree is active
      await expect(newWtItem).toHaveClass(/active/);

      // Verify that the branch points to the correct starting point (same commit as feature/wt-test)
      const baseBranchCommit = await sandbox.git.revparse(['feature/wt-test']);
      const newBranchCommit = await sandbox.git.revparse(['feature/wt-from-base']);
      expect(newBranchCommit).toBe(baseBranchCommit);

    } finally {
      await app.close();
    }
  });

  test('should support merging and rebasing from another branch in a worktree', async () => {
    const { app, page } = await launchElectronApp();

    try {
      // Mock openDirectory dialog to open our sandbox
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

      // Find the worktree section and switch to the first worktree ('feature/wt-test')
      const worktreeSection = page.locator('.sidebar-section:has-text("Worktree")');
      await expect(worktreeSection).toBeVisible();
      
      const extraWtItem = worktreeSection.locator('.sidebar-item').filter({ hasText: 'feature/wt-test' });
      await extraWtItem.click();
      await page.waitForTimeout(500);

      // Verify worktree is active (active class on worktree item)
      await expect(extraWtItem).toHaveClass(/active/);

      // Verify we can see the main repository's branch (defaultBranch) in the Local branches list,
      // and it should have a merge and rebase button
      const mainBranchItem = page.locator(`[data-testid="sidebar-branch-${defaultBranch}"]`);
      await expect(mainBranchItem).toBeVisible();

      // Hover over the branch item so the branch-actions container is visible
      await mainBranchItem.hover();

      const mergeBtn = mainBranchItem.locator(`[data-testid="merge-branch-btn-${defaultBranch}"]`);
      await expect(mergeBtn).toBeVisible();

      // We will perform a merge of 'defaultBranch' into the active worktree branch ('feature/wt-test')
      await mergeBtn.click();

      // Confirm merge in modal
      const mergeModal = page.locator('.diff-modal-overlay');
      await expect(mergeModal).toBeVisible();
      await page.waitForTimeout(500); // let modal scale-in settle
      const confirmMergeBtn = mergeModal.locator('[data-testid="confirm-merge-btn"]');
      await confirmMergeBtn.click();
      
      // Wait for merge operation to finish and modal to disappear
      await expect(mergeModal).toBeHidden();
      await page.waitForTimeout(500); // settle time

      // Since there are no conflicts, the merge should complete successfully.
      // Now verify that the main worktree branch (which is inactive) has merge/rebase buttons in the Worktrees list
      const mainWtItem = worktreeSection.locator('.sidebar-item').first();
      await mainWtItem.hover();

      const mainWtMergeBtn = mainWtItem.locator(`[data-testid="merge-worktree-btn-${defaultBranch}"]`);
      await expect(mainWtMergeBtn).toBeVisible();

      const mainWtRebaseBtn = mainWtItem.locator(`[data-testid="rebase-worktree-btn-${defaultBranch}"]`);
      await expect(mainWtRebaseBtn).toBeVisible();

    } finally {
      await app.close();
    }
  });
});
