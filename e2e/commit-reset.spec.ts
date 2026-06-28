import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import fs from 'fs'
import path from 'path'

test.describe('Reset Branch to Commit', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])
    
    // Create multiple commits
    await sandbox.createCommit('file1.txt', 'Content for commit 1', 'First custom commit')
    await sandbox.createCommit('file2.txt', 'Content for commit 2', 'Second custom commit')
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('should perform a soft reset to a specific commit', async () => {
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

      console.log('6. Finding the commit "First custom commit" in the list...')
      const commitList = page.locator('.commit-list')
      await expect(commitList).toBeVisible()

      const firstCommitRow = page.locator('.commit-item', { hasText: 'First custom commit' })
      await expect(firstCommitRow).toBeVisible()

      console.log('7. Hovering over the commit row to show action buttons...')
      await firstCommitRow.hover()
      await page.waitForTimeout(300)

      console.log('8. Clicking the reset button inside the commit row...')
      // Retrieve hash to locate data-testid
      const commitLog = await sandbox.git.log()
      const firstCustomCommit = commitLog.all.find(commit => commit.message === 'First custom commit')
      expect(firstCustomCommit).toBeDefined()
      const resetBtn = firstCommitRow.locator(`[data-testid="commit-reset-btn-${firstCustomCommit!.hash}"]`)
      await expect(resetBtn).toBeVisible()
      await resetBtn.click()
      await page.waitForTimeout(300)

      console.log('9. Verifying that the reset modal is open...')
      const modal = page.locator('.diff-modal-content')
      await expect(modal).toBeVisible()
      await expect(modal).toContainText('Reset Branch to Commit')
      await expect(modal).toContainText('First custom commit')

      console.log('10. Selecting Soft Reset...')
      const softCard = page.locator('[data-testid="reset-mode-soft-card"]')
      await expect(softCard).toBeVisible()
      await softCard.click()

      console.log('11. Clicking confirm reset button...')
      const confirmBtn = page.locator('[data-testid="confirm-reset-btn"]')
      await expect(confirmBtn).toBeVisible()
      await confirmBtn.click()
      await page.waitForTimeout(1000)

      console.log('12. Verifying the reset modal is closed...')
      await expect(modal).not.toBeVisible()

      console.log('13. Verifying Git HEAD hash has moved to First custom commit...')
      const newHeadHash = await sandbox.git.revparse(['HEAD'])
      expect(newHeadHash.trim()).toBe(firstCustomCommit!.hash)

      console.log('14. Verifying file2.txt is staged (changes to be committed)...')
      const status = await sandbox.git.status()
      expect(status.staged).toContain('file2.txt')
      
      console.log('Soft reset verified successfully.')
    } finally {
      await app.close()
    }
  })

  test('should perform a hard reset to a specific commit', async () => {
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

      console.log('6. Finding the commit "First custom commit" in the list...')
      const commitList = page.locator('.commit-list')
      await expect(commitList).toBeVisible()

      const firstCommitRow = page.locator('.commit-item', { hasText: 'First custom commit' })
      await expect(firstCommitRow).toBeVisible()

      console.log('7. Hovering over the commit row to show action buttons...')
      await firstCommitRow.hover()
      await page.waitForTimeout(300)

      console.log('8. Clicking the reset button inside the commit row...')
      const commitLog = await sandbox.git.log()
      const firstCustomCommit = commitLog.all.find(commit => commit.message === 'First custom commit')
      expect(firstCustomCommit).toBeDefined()
      const resetBtn = firstCommitRow.locator(`[data-testid="commit-reset-btn-${firstCustomCommit!.hash}"]`)
      await expect(resetBtn).toBeVisible()
      await resetBtn.click()
      await page.waitForTimeout(300)

      console.log('9. Verifying that the reset modal is open...')
      const modal = page.locator('.diff-modal-content')
      await expect(modal).toBeVisible()

      console.log('10. Selecting Hard Reset...')
      const hardCard = page.locator('[data-testid="reset-mode-hard-card"]')
      await expect(hardCard).toBeVisible()
      await hardCard.click()

      console.log('11. Clicking confirm reset button...')
      const confirmBtn = page.locator('[data-testid="confirm-reset-btn"]')
      await expect(confirmBtn).toBeVisible()
      await confirmBtn.click()
      await page.waitForTimeout(1000)

      console.log('12. Verifying the reset modal is closed...')
      await expect(modal).not.toBeVisible()

      console.log('13. Verifying Git HEAD hash has moved to First custom commit...')
      const newHeadHash = await sandbox.git.revparse(['HEAD'])
      expect(newHeadHash.trim()).toBe(firstCustomCommit!.hash)

      console.log('14. Verifying file2.txt is completely gone from workdir (due to hard reset)...')
      const status = await sandbox.git.status()
      expect(status.files.length).toBe(0)
      
      const file2Exists = fs.existsSync(path.join(sandbox.dir, 'file2.txt'))
      expect(file2Exists).toBe(false)
      
      console.log('Hard reset verified successfully.')
    } finally {
      await app.close()
    }
  })
})
