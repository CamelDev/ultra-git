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
      const stageBtn = untrackedItem.locator('.stage-btn')
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
      const unstageBtn = stagedUntrackedItem.locator('.unstage-btn')
      await unstageBtn.click()
      await page.waitForTimeout(500)

      // Both should be in Changed files list now
      await expect(stagedItems).toHaveCount(0)
      await expect(unstagedItems).toHaveCount(2)

      // 6. Stage All
      const stageAllBtn = page.locator('.toolbar .btn-primary', { hasText: 'Stage all' })
      await stageAllBtn.click()
      await page.waitForTimeout(500)

      // All files should be staged
      await expect(stagedItems).toHaveCount(2)
      await expect(unstagedItems).toHaveCount(0)

      // 7. Unstage All
      const unstageAllBtn = page.locator('.toolbar .btn-secondary', { hasText: 'Unstage all' })
      await unstageAllBtn.click()
      await page.waitForTimeout(500)

      // All files should be unstaged again
      await expect(stagedItems).toHaveCount(0)
      await expect(unstagedItems).toHaveCount(2)

      // 8. Commit functionality verification
      const commitInput = page.locator('.toolbar [data-testid="commit-message-input"]')
      const commitBtn = page.locator('.toolbar [data-testid="commit-btn"]')

      // Commit button should be disabled initially (empty message)
      await expect(commitBtn).toBeDisabled()

      // Type a 2-character message and verify it is still disabled
      await commitInput.fill('ab')
      await expect(commitBtn).toBeDisabled()

      // Stage the files first so there is something to commit
      await stageAllBtn.click()
      await page.waitForTimeout(500)
      await expect(stagedItems).toHaveCount(2)

      // Type a valid commit message (> 2 chars) and verify it is enabled
      await commitInput.fill('xyz')
      await expect(commitBtn).toBeEnabled()

      // Click commit
      await commitBtn.click()
      await page.waitForTimeout(1000)

      // Active changes panel should disappear because files are committed (no active changes left)
      await expect(panel).not.toBeVisible()

    } finally {
      await app.close()
    }
  })

  test('should show warning dialog and not commit if nothing is staged', async () => {
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

      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(500)

      // Create unstaged changes
      fs.appendFileSync(path.join(sandbox.dir, 'README.md'), 'Modified README again\n')

      // Switch tabs to trigger status refresh
      await tabs.first().click()
      await page.waitForTimeout(500)
      await tabs.last().click()
      await page.waitForTimeout(500)

      // Verify active changes panel is visible
      const panel = page.locator('[data-testid="active-changes-panel"]')
      await expect(panel).toBeVisible()

      const commitInput = page.locator('.toolbar [data-testid="commit-message-input"]')
      const commitBtn = page.locator('.toolbar [data-testid="commit-btn"]')

      // Fill valid commit message
      await commitInput.fill('Valid message but empty staging')
      await expect(commitBtn).toBeEnabled()

      // Click commit - this should show the in-app warning dialog
      await commitBtn.click()

      // Verify the in-app AppDialog is shown with the correct content
      const noChangesDialog = page.locator('[data-testid="no-changes-staged-dialog"]')
      await expect(noChangesDialog).toBeVisible()
      await expect(noChangesDialog).toContainText('No changes staged')
      await expect(noChangesDialog).toContainText('no changes staged to be committed')
      await expect(noChangesDialog).toHaveAttribute('data-variant', 'warning')

      // Verify active changes panel is still visible (commit did not execute)
      await expect(panel).toBeVisible()

      // Close the dialog by clicking OK
      await noChangesDialog.locator('[data-testid="no-changes-staged-dialog-ok"]').click()
      await expect(noChangesDialog).not.toBeVisible()

    } finally {
      await app.close()
    }
  })

  test('should support stashing all changes via the toolbar', async () => {
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

      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(500)

      // Create unstaged changes (untracked file + modified file)
      fs.writeFileSync(path.join(sandbox.dir, 'untracked-stash.txt'), 'Stash untracked content\n')
      fs.appendFileSync(path.join(sandbox.dir, 'README.md'), 'Modified README for stash\n')

      // Switch tabs to trigger status refresh
      await tabs.first().click()
      await page.waitForTimeout(500)
      await tabs.last().click()
      await page.waitForTimeout(500)

      // Verify active changes panel is visible
      const panel = page.locator('[data-testid="active-changes-panel"]')
      await expect(panel).toBeVisible()

      // Click Stash all button in toolbar
      const stashAllBtn = page.locator('[data-testid="stash-all-btn"]')
      await expect(stashAllBtn).toBeVisible()
      await stashAllBtn.click()
      await page.waitForTimeout(1000)

      // Verify active changes panel is hidden (no uncommitted changes left)
      await expect(panel).not.toBeVisible()

      // Verify stash entry exists in sidebar
      const stashItem = page.locator('[data-testid="stash-item-0"]')
      await expect(stashItem).toBeVisible()
      await expect(stashItem).toContainText('Initial commit')

      // Check git stash list directly in sandbox to verify
      const stashes = await sandbox.git.stashList()
      expect(stashes.total).toBe(1)

    } finally {
      await app.close()
    }
  })

  test('should support resetting (discarding) changes with confirmation', async () => {
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

      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(500)

      // Create unstaged changes (untracked file + modified file)
      const untrackedPath = path.join(sandbox.dir, 'untracked-reset.txt')
      fs.writeFileSync(untrackedPath, 'Untracked reset content\n')
      fs.appendFileSync(path.join(sandbox.dir, 'README.md'), 'Modified README for reset\n')

      // Switch tabs to trigger status refresh
      await tabs.first().click()
      await page.waitForTimeout(500)
      await tabs.last().click()
      await page.waitForTimeout(500)

      // Verify active changes panel is visible
      const panel = page.locator('[data-testid="active-changes-panel"]')
      await expect(panel).toBeVisible()

      const unstagedColumn = panel.locator('.unstaged-column')
      const unstagedItems = unstagedColumn.locator('.file-item')
      await expect(unstagedItems).toHaveCount(2)

      // --- 1. Discard cancellation test ---
      // We will mock showMessageBox to return response: 0 (Cancel)
      await app.evaluate(async ({ ipcMain }) => {
        (global as any).showMessageBoxOptions = null
        ipcMain.removeHandler('dialog:showMessageBox')
        ipcMain.handle('dialog:showMessageBox', async (_, options) => {
          (global as any).showMessageBoxOptions = options
          return { success: true, response: 0 } // Cancel
        })
      })

      // Find the untracked file item and hover
      const untrackedItem = unstagedItems.filter({ hasText: 'untracked-reset.txt' })
      await expect(untrackedItem).toBeVisible()
      
      // Click discard/reset button
      const discardBtnCancel = untrackedItem.locator('.reset-btn')
      await discardBtnCancel.click()
      await page.waitForTimeout(500)

      // Verify showMessageBox was called with Cancel, and file is still there
      let dialogOptions = await app.evaluate(() => (global as any).showMessageBoxOptions)
      expect(dialogOptions).not.toBeNull()
      expect(dialogOptions.title).toBe('Discard Changes')
      expect(dialogOptions.message).toContain('untracked-reset.txt')
      await expect(unstagedItems).toHaveCount(2)
      expect(fs.existsSync(untrackedPath)).toBe(true)

      // --- 2. Discard confirmation test (Untracked file) ---
      // Mock showMessageBox to return response: 1 (Discard)
      await app.evaluate(async ({ ipcMain }) => {
        ipcMain.removeHandler('dialog:showMessageBox')
        ipcMain.handle('dialog:showMessageBox', async (_, options) => {
          (global as any).showMessageBoxOptions = options
          return { success: true, response: 1 } // Discard
        })
      })

      // Click discard/reset button again (this time confirming)
      const discardBtnConfirm = untrackedItem.locator('.reset-btn')
      await discardBtnConfirm.click()
      await page.waitForTimeout(1000)

      // Verify file is deleted from filesystem and removed from UI list
      await expect(unstagedItems).toHaveCount(1)
      expect(fs.existsSync(untrackedPath)).toBe(false)

      // --- 3. Discard confirmation test (Tracked modified file) ---
      const readmeItem = unstagedItems.filter({ hasText: 'README.md' })
      await expect(readmeItem).toBeVisible()
      
      const discardReadmeBtn = readmeItem.locator('.reset-btn')
      await discardReadmeBtn.click()
      await page.waitForTimeout(1000)

      // Active changes panel should disappear because no files left modified/unstaged/staged
      await expect(panel).not.toBeVisible()
      
      // Verify README file contents reverted
      const readmeContent = fs.readFileSync(path.join(sandbox.dir, 'README.md'), 'utf8')
      expect(readmeContent).not.toContain('Modified README for reset')

    } finally {
      await app.close()
    }
  })
})
