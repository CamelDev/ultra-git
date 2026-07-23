import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import fs from 'fs'
import path from 'path'

test.describe('Sidebar Collapse and Expansion Persistence', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])
    await sandbox.git.addConfig('user.name', 'Test User', false, 'local')
    await sandbox.git.addConfig('user.email', 'test@example.com', false, 'local')
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('should support collapsing, expanding, and localStorage persistence for all sidebar sections', async () => {
    console.log('[Sidebar Collapse Test] 1. Initializing repository content in sandbox...');
    fs.writeFileSync(path.join(sandbox.dir, 'README.md'), '# Initial README\n')
    await sandbox.git.add('README.md')
    await sandbox.git.commit('Initial commit')

    // Create a local branch
    await sandbox.git.branch(['feature-branch'])

    // Create a stash
    fs.writeFileSync(path.join(sandbox.dir, 'README.md'), '# Initial README\nModified line in stash\n')
    await sandbox.git.stash(['push', '-m', 'Stash item'])

    // Create a tag
    await sandbox.git.addAnnotatedTag('v1.0.0', 'Version 1.0.0 tag')

    console.log('[Sidebar Collapse Test] 2. Launching Electron App...');
    const { app, page } = await launchElectronApp()

    try {
      console.log('[Sidebar Collapse Test] 3. Clearing localStorage...');
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      console.log('[Sidebar Collapse Test] 4. Mocking dialog:openDirectory...');
      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, sandbox.dir)

      console.log('[Sidebar Collapse Test] 5. Adding sandbox repository...');
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()

      console.log('[Sidebar Collapse Test] 6. Switching to repository tab...');
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // Get locators for items
      const worktreeItem = page.locator(`[data-tooltip="${sandbox.dir}"]`)
      const branchItem = page.locator('[data-testid="sidebar-branch-feature-branch"]')
      const stashItem = page.locator('[data-testid="stash-item-0"]')
      const tagItem = page.locator('[data-testid="sidebar-tag-v1.0.0"]')

      // Get locators for headers
      const worktreesHeader = page.locator('[data-testid="sidebar-worktrees-header"]')
      const localBranchesHeader = page.locator('[data-testid="sidebar-local-branches-header"]')
      const remoteBranchesHeader = page.locator('[data-testid="sidebar-remote-branches-header"]')
      const stashesHeader = page.locator('[data-testid="sidebar-stashes-header"]')
      const tagsHeader = page.locator('[data-testid="sidebar-tags-header"]')

      console.log('[Sidebar Collapse Test] 7. Verifying all sections are visible initially...');
      await expect(worktreesHeader).toBeVisible()
      await expect(localBranchesHeader).toBeVisible()
      await expect(remoteBranchesHeader).toBeVisible()
      await expect(stashesHeader).toBeVisible()
      await expect(tagsHeader).toBeVisible()

      await expect(worktreeItem).toBeVisible()
      await expect(branchItem).toBeVisible()
      await expect(stashItem).toBeVisible()
      await expect(tagItem).toBeVisible()

      console.log('[Sidebar Collapse Test] 8. Collapsing Worktree Branches...');
      await worktreesHeader.click()
      await page.waitForTimeout(300)
      await expect(worktreeItem).not.toBeVisible()
      expect(await page.evaluate(() => localStorage.getItem('sidebar-worktrees-collapsed'))).toBe('true')

      console.log('[Sidebar Collapse Test] 9. Collapsing Local Branches...');
      await localBranchesHeader.click()
      await page.waitForTimeout(300)
      await expect(branchItem).not.toBeVisible()
      expect(await page.evaluate(() => localStorage.getItem('sidebar-local-branches-collapsed'))).toBe('true')

      console.log('[Sidebar Collapse Test] 10. Collapsing Stashes...');
      await stashesHeader.click()
      await page.waitForTimeout(300)
      await expect(stashItem).not.toBeVisible()
      expect(await page.evaluate(() => localStorage.getItem('sidebar-stashes-collapsed'))).toBe('true')

      console.log('[Sidebar Collapse Test] 11. Collapsing Tags...');
      await tagsHeader.click()
      await page.waitForTimeout(300)
      await expect(tagItem).not.toBeVisible()
      expect(await page.evaluate(() => localStorage.getItem('sidebar-tags-collapsed'))).toBe('true')

      console.log('[Sidebar Collapse Test] 12. Reloading page to test persistence...');
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      console.log('[Sidebar Collapse Test] 13. Verifying sections start collapsed...');
      await expect(worktreeItem).not.toBeVisible()
      await expect(branchItem).not.toBeVisible()
      await expect(stashItem).not.toBeVisible()
      await expect(tagItem).not.toBeVisible()

      console.log('[Sidebar Collapse Test] 14. Expanding sections...');
      await worktreesHeader.click()
      await page.waitForTimeout(300)
      await expect(worktreeItem).toBeVisible()
      expect(await page.evaluate(() => localStorage.getItem('sidebar-worktrees-collapsed'))).toBe('false')

      await localBranchesHeader.click()
      await page.waitForTimeout(300)
      await expect(branchItem).toBeVisible()
      expect(await page.evaluate(() => localStorage.getItem('sidebar-local-branches-collapsed'))).toBe('false')

      await stashesHeader.click()
      await page.waitForTimeout(300)
      await expect(stashItem).toBeVisible()
      expect(await page.evaluate(() => localStorage.getItem('sidebar-stashes-collapsed'))).toBe('false')

      await tagsHeader.click()
      await page.waitForTimeout(300)
      await expect(tagItem).toBeVisible()
      expect(await page.evaluate(() => localStorage.getItem('sidebar-tags-collapsed'))).toBe('false')

      console.log('[Sidebar Collapse Test] Sidebar collapse E2E test finished successfully!');

    } finally {
      console.log('Closing app...');
      await app.close()
    }
  })
})
