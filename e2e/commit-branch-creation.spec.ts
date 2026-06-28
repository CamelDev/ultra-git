import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'

test.describe('Branch Creation from Specific Commit', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])
    
    // Create multiple commits to have history
    await sandbox.createCommit('file1.txt', 'Content for commit 1', 'First custom commit')
    await sandbox.createCommit('file2.txt', 'Content for commit 2', 'Second custom commit')
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('should create branch from a specific commit in history', async () => {
    console.log('1. Launching Electron App...')
    const { app, page } = await launchElectronApp()

    try {
      console.log('2. Clearing localStorage...')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      console.log('3. Mocking dialog:openDirectory...')
      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, sandbox.dir)

      console.log('4. Clicking to add repository...')
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()

      console.log('5. Switching to the newly added repository tab...')
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      console.log('6. Finding the commit "First custom commit" in the commit list...')
      // Wait for commit list to be loaded
      const commitList = page.locator('.commit-list')
      await expect(commitList).toBeVisible()

      // Find the specific commit row
      const firstCommitRow = page.locator('.commit-item', { hasText: 'First custom commit' })
      await expect(firstCommitRow).toBeVisible()

      console.log('7. Hovering over the commit row to make the branch button visible...')
      await firstCommitRow.hover()
      await page.waitForTimeout(300)

      console.log('8. Clicking the branch button inside the commit row...')
      // Find the branch button inside the hovered row
      const branchBtn = firstCommitRow.locator('.stash-action-btn')
      await expect(branchBtn).toBeVisible()
      await branchBtn.click()
      await page.waitForTimeout(300)

      console.log('9. Verifying that the branch creation modal is open...')
      const modal = page.locator('.diff-modal-content')
      await expect(modal).toBeVisible()
      await expect(modal).toContainText('Create Branch from Commit')

      console.log('10. Entering the new branch name...')
      const input = page.locator('[data-testid="new-branch-name-input"]')
      await expect(input).toBeFocused()
      await input.fill('branch-from-commit-1')

      console.log('11. Clicking submit button...')
      const submitBtn = page.locator('[data-testid="create-branch-submit-btn"]')
      await expect(submitBtn).toBeEnabled()
      await submitBtn.click()
      await page.waitForTimeout(1000)

      console.log('12. Verifying the branch modal is closed...')
      await expect(modal).not.toBeVisible()

      console.log('13. Verifying active branch in UI switches to branch-from-commit-1...')
      const activeBranch = page.locator('[data-testid="sidebar-active-branch"]')
      await expect(activeBranch).toContainText('branch-from-commit-1')

      console.log('14. Verifying Git repository state via sandbox...')
      const currentBranch = await sandbox.git.revparse(['--abbrev-ref', 'HEAD'])
      expect(currentBranch.trim()).toBe('branch-from-commit-1')

      console.log('15. Verifying the branch points to the correct commit (First custom commit)...')
      // Get the hash of 'First custom commit' in sandbox
      const commitLog = await sandbox.git.log()
      const firstCustomCommit = commitLog.all.find(commit => commit.message === 'First custom commit')
      expect(firstCustomCommit).toBeDefined()
      
      const newBranchHash = await sandbox.git.revparse(['HEAD'])
      expect(newBranchHash.trim()).toBe(firstCustomCommit!.hash)

      console.log('Branch creation from specific commit E2E test verified successfully.')
    } finally {
      await app.close()
    }
  })
})
