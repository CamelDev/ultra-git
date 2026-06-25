import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import path from 'path'
import fs from 'fs'

test.describe('Active Changes Panel', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('should display active changes, support staging/unstaging, and open diff modal', async () => {
    const { app, page } = await launchElectronApp()
    page.on('console', msg => console.log('PAGE LOG:', msg.text()))
    page.on('pageerror', err => console.error('PAGE ERROR:', err.message))

    try {
      // Clear localStorage
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Mock openDirectory dialog to load sandbox repo
      await app.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath }
        })
      }, sandbox.dir)

      // Click to add repository
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()

      const expectedTabName = path.basename(sandbox.dir)
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(500)

      // 1. Initial State: No active changes panel should be visible
      const panel = page.locator('[data-testid="active-changes-panel"]')
      await expect(panel).not.toBeVisible()

      // 2. Create unstaged changes (untracked file + modified file)
      fs.writeFileSync(path.join(sandbox.dir, 'untracked.txt'), 'Hello untracked file\n')
      fs.appendFileSync(path.join(sandbox.dir, 'README.md'), 'Modified README\n')

      // Switch tabs to trigger status refresh on the sandbox repo
      await tabs.first().click()
      await page.waitForTimeout(500)
      await tabs.last().click()
      await page.waitForTimeout(500)

      // Verify active changes panel is now visible
      await expect(panel).toBeVisible()

      // Check Changed files column contents
      const unstagedColumn = panel.locator('.unstaged-column')
      const unstagedItems = unstagedColumn.locator('.file-item')
      await expect(unstagedItems).toHaveCount(2)

      // 3. Stage a single file
      // Find 'untracked.txt' item
      const untrackedItem = unstagedItems.filter({ hasText: 'untracked.txt' })
      await expect(untrackedItem).toBeVisible()

      // Hover over the item to reveal 'Stage' button and click it
      const stageBtn = untrackedItem.locator('.action-btn')
      await stageBtn.click()
      await page.waitForTimeout(500)

      // Verify untracked.txt is staged (it should move to Staged column)
      const stagedColumn = panel.locator('.staged-column')
      const stagedItems = stagedColumn.locator('.file-item')
      await expect(stagedItems).toHaveCount(1)
      await expect(stagedItems.first()).toContainText('untracked.txt')
      await expect(unstagedItems).toHaveCount(1) // only README.md left unstaged

      // 4. Click a file item to open the diff modal
      const readmeItem = unstagedItems.first()
      await readmeItem.click()
      await page.waitForTimeout(500)

      const diffModal = page.locator('.diff-modal-overlay')
      await expect(diffModal).toBeVisible()
      await expect(diffModal).toContainText('Unstaged changes')
      await expect(diffModal).toContainText('README.md')

      // Close diff modal
      const closeBtn = diffModal.locator('.diff-modal-close')
      await closeBtn.click()
      await expect(diffModal).not.toBeVisible()

      // 5. Unstage a single file
      const stagedUntrackedItem = stagedItems.first()
      const unstageBtn = stagedUntrackedItem.locator('.action-btn')
      await unstageBtn.click()
      await page.waitForTimeout(500)

      // Both should be in Changed files list now
      await expect(stagedItems).toHaveCount(0)
      await expect(unstagedItems).toHaveCount(2)

      // 6. Stage All
      const stageAllBtn = panel.locator('.btn-primary', { hasText: 'Stage all' })
      await stageAllBtn.click()
      await page.waitForTimeout(500)

      // All files should be staged
      await expect(stagedItems).toHaveCount(2)
      await expect(unstagedItems).toHaveCount(0)

      // 7. Unstage All
      const unstageAllBtn = panel.locator('.btn-secondary', { hasText: 'Unstage all' })
      await unstageAllBtn.click()
      await page.waitForTimeout(500)

      // All files should be unstaged again
      await expect(stagedItems).toHaveCount(0)
      await expect(unstagedItems).toHaveCount(2)

    } finally {
      await app.close()
    }
  })
})
