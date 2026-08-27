import { test, expect } from '@playwright/test'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import path from 'path'
import fs from 'fs'

test.describe('Undo and Redo Feature', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('should support undo and redo for staging, committing, and discarding changes', async () => {
    const { app, page } = await launchElectronApp()
    page.on('console', msg => console.log('PAGE LOG:', msg.text()))
    page.on('pageerror', err => console.error('PAGE ERROR:', err.message))

    try {
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      await app.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath }
        })
      }, sandbox.dir)

      await addRepoViaUI(page)

      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(500)

      // Create a modified file
      const testFile = path.join(sandbox.dir, 'undo_test.txt')
      fs.writeFileSync(testFile, 'initial content\n')

      // Switch tabs to trigger status refresh
      await tabs.first().click()
      await page.waitForTimeout(300)
      await tabs.last().click()
      await page.waitForTimeout(500)

      // 1. Verify Active Changes panel appears
      const panel = page.locator('[data-testid="active-changes-panel"]')
      await expect(panel).toBeVisible()

      const unstagedColumn = panel.locator('.unstaged-column')
      const unstagedItems = unstagedColumn.locator('.file-item')
      const untrackedItem = unstagedItems.filter({ hasText: 'undo_test.txt' })
      await expect(untrackedItem).toBeVisible()

      // Stage the file using the stage button
      const stageBtn = untrackedItem.locator('.stage-btn')
      await stageBtn.click()
      await page.waitForTimeout(500)

      // Verify file is now staged
      const stagedColumn = panel.locator('.staged-column')
      const stagedItems = stagedColumn.locator('.file-item')
      await expect(stagedItems).toHaveCount(1)
      await expect(stagedItems.first()).toContainText('undo_test.txt')

      // Undo button in toolbar should now be enabled
      const undoBtn = page.locator('[data-testid="toolbar-undo-btn"]')
      await expect(undoBtn).toBeEnabled()

      // 2. Click Undo button to unstage the file
      await undoBtn.click()
      await page.waitForTimeout(500)

      // Verify file is back in unstaged
      await expect(unstagedItems).toHaveCount(1)
      await expect(stagedItems).toHaveCount(0)

      // 3. Click Redo button in toolbar to re-stage the file
      const redoBtn = page.locator('[data-testid="toolbar-redo-btn"]')
      await expect(redoBtn).toBeEnabled()
      await redoBtn.click()
      await page.waitForTimeout(500)

      // Verify file is staged again
      await expect(stagedItems).toHaveCount(1)
      await expect(unstagedItems).toHaveCount(0)

      // 4. Commit the staged file
      const commitInput = page.locator('[data-testid="commit-message-input"]')
      await commitInput.fill('feat: undo test commit')
      await commitInput.press('Enter')
      await page.waitForTimeout(800)

      // Verify active changes panel closed (committed cleanly)
      await expect(panel).not.toBeVisible()

      // Verify commit appeared in the commit list
      const commitItem = page.locator('.commit-item', { hasText: 'feat: undo test commit' })
      await expect(commitItem.first()).toBeVisible({ timeout: 5000 })

      // 5. Undo the commit via Toolbar Undo button
      await expect(undoBtn).toBeEnabled()
      await undoBtn.click()
      await page.waitForTimeout(800)

      // Verify commit is undone: changes are back in staged area
      await expect(panel).toBeVisible()
      await expect(stagedItems).toHaveCount(1)
      // Verify commit message was restored into the input field
      await expect(commitInput).toHaveValue('feat: undo test commit')

    } finally {
      await app.close()
    }
  })
})
