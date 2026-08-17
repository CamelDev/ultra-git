import { test, expect } from '@playwright/test'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
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
      await addRepoViaUI(page)

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
      await addRepoViaUI(page)

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
      await addRepoViaUI(page)

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
      await addRepoViaUI(page)

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
      // Find the untracked file item and hover
      const untrackedItem = unstagedItems.filter({ hasText: 'untracked-reset.txt' })
      await expect(untrackedItem).toBeVisible()
      
      // Click discard/reset button
      const discardBtnCancel = untrackedItem.locator('.reset-btn')
      await discardBtnCancel.click()

      // Custom dialog appears
      const dialogCancelBtn = page.locator('[data-testid="discard-changes-dialog-action-cancel"]')
      await expect(dialogCancelBtn).toBeVisible()
      await dialogCancelBtn.click()
      await page.waitForTimeout(500)

      // Verify file is still there
      await expect(unstagedItems).toHaveCount(2)
      expect(fs.existsSync(untrackedPath)).toBe(true)

      // --- 2. Discard confirmation test (Untracked file) ---
      // Click discard/reset button again and confirm in custom dialog
      const discardBtnConfirm = untrackedItem.locator('.reset-btn')
      await discardBtnConfirm.click()

      const dialogConfirmBtn = page.locator('[data-testid="discard-changes-dialog-action-discard"]')
      await expect(dialogConfirmBtn).toBeVisible()
      await dialogConfirmBtn.click()
      await page.waitForTimeout(1000)

      // Verify file is deleted from filesystem and removed from UI list
      await expect(unstagedItems).toHaveCount(1)
      expect(fs.existsSync(untrackedPath)).toBe(false)

      // --- 3. Discard confirmation test (Tracked modified file) ---
      const readmeItem = unstagedItems.filter({ hasText: 'README.md' })
      await expect(readmeItem).toBeVisible()
      
      const discardReadmeBtn = readmeItem.locator('.reset-btn')
      await discardReadmeBtn.click()

      const dialogConfirmBtn2 = page.locator('[data-testid="discard-changes-dialog-action-discard"]')
      await expect(dialogConfirmBtn2).toBeVisible()
      await dialogConfirmBtn2.click()
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

  test('should support navigating between files in diff modal using buttons and keyboard shortcuts', async () => {
    // Modify multiple files to create exactly 3 unstaged changes
    fs.writeFileSync(path.join(sandbox.dir, 'file1.txt'), 'Content 1 modified\n')
    fs.writeFileSync(path.join(sandbox.dir, 'file2.txt'), 'Content 2 modified\n')
    fs.writeFileSync(path.join(sandbox.dir, 'file3.txt'), 'Content 3 modified\n')

    const { app, page } = await launchElectronApp()

    try {
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

      await addRepoViaUI(page)

      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      const panel = page.locator('[data-testid="active-changes-panel"]')
      await expect(panel).toBeVisible()

      const unstagedColumn = panel.locator('.unstaged-column')
      const unstagedItems = unstagedColumn.locator('.file-item')
      const initialCount = await unstagedItems.count()
      expect(initialCount).toBeGreaterThanOrEqual(3)

      // Click the first file to open DiffModal
      await unstagedItems.first().click()
      await page.waitForTimeout(500)

      const diffModal = page.locator('.diff-modal-overlay')
      await expect(diffModal).toBeVisible()

      // Verify file navigation bar
      const fileNav = diffModal.locator('[data-testid="file-nav"]')
      await expect(fileNav).toBeVisible()

      const counter = fileNav.locator('[data-testid="file-counter"]')
      await expect(counter).toHaveText(`File 1 of ${initialCount}`)

      const prevBtn = fileNav.locator('[data-testid="prev-file-btn"]')
      const nextBtn = fileNav.locator('[data-testid="next-file-btn"]')

      await expect(prevBtn).toBeDisabled()
      await expect(nextBtn).toBeEnabled()

      // Click next button to go to 2nd file
      await nextBtn.click()
      await page.waitForTimeout(300)
      await expect(counter).toHaveText(`File 2 of ${initialCount}`)
      await expect(prevBtn).toBeEnabled()
      await expect(nextBtn).toBeEnabled()

      // Use 'D' key shortcut to go to 3rd file
      await page.keyboard.press('d')
      await page.waitForTimeout(300)
      await expect(counter).toHaveText(`File 3 of ${initialCount}`)

      // Use 'A' key shortcut to go back to 2nd file
      await page.keyboard.press('a')
      await page.waitForTimeout(300)
      await expect(counter).toHaveText(`File 2 of ${initialCount}`)

      // Click prev button to go back to 1st file
      await prevBtn.click()
      await page.waitForTimeout(300)
      await expect(counter).toHaveText(`File 1 of ${initialCount}`)
      await expect(prevBtn).toBeDisabled()

      // Click Stage File button in modal
      const stageFileModalBtn = diffModal.getByTestId('stage-file-modal-btn')
      await expect(stageFileModalBtn).toBeVisible()
      await stageFileModalBtn.click()
      await page.waitForTimeout(500)

      // Counter should now reflect initialCount - 1 since 1 file was moved to staged
      await expect(counter).toHaveText(`File 1 of ${initialCount - 1}`)

      // Close diff modal
      const closeBtn = diffModal.locator('.diff-modal-close')
      await closeBtn.click()
      await expect(diffModal).not.toBeVisible()

    } finally {
      await app.close()
    }
  })

  test('should commit staged changes when user presses Enter in commit message input', async () => {
    const { app, page } = await launchElectronApp()

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

      fs.writeFileSync(path.join(sandbox.dir, 'commit-enter.txt'), 'Content for enter commit test\n')

      await tabs.first().click()
      await page.waitForTimeout(500)
      await tabs.last().click()
      await page.waitForTimeout(500)

      const panel = page.locator('[data-testid="active-changes-panel"]')
      await expect(panel).toBeVisible()

      const stageAllBtn = page.locator('.toolbar .btn-primary', { hasText: 'Stage all' })
      await stageAllBtn.click()
      await page.waitForTimeout(500)

      const commitInput = page.locator('.toolbar [data-testid="commit-message-input"]')
      await commitInput.fill('Commit via Enter key')
      await commitInput.press('Enter')
      await page.waitForTimeout(1000)

      await expect(panel).not.toBeVisible()
    } finally {
      await app.close()
    }
  })

  test('should support multi-file selection, select-all checkbox, batch stage, batch unstage, and batch discard', async () => {
    const { app, page } = await launchElectronApp()

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

      // Create 3 untracked files
      fs.writeFileSync(path.join(sandbox.dir, 'file1.txt'), 'File 1 content\n')
      fs.writeFileSync(path.join(sandbox.dir, 'file2.txt'), 'File 2 content\n')
      fs.writeFileSync(path.join(sandbox.dir, 'file3.txt'), 'File 3 content\n')

      await tabs.first().click()
      await page.waitForTimeout(500)
      await tabs.last().click()
      await page.waitForTimeout(500)

      const panel = page.locator('[data-testid="active-changes-panel"]')
      await expect(panel).toBeVisible()

      const unstagedColumn = panel.locator('.unstaged-column')
      const stagedColumn = panel.locator('.staged-column')
      const unstagedItems = unstagedColumn.locator('.file-item')
      const stagedItems = stagedColumn.locator('.file-item')

      await expect(unstagedItems).toHaveCount(3)

      // 1. Select All checkbox in unstaged column
      const selectAllUnstagedCheckbox = unstagedColumn.locator('[data-testid="select-all-unstaged-checkbox"]')
      await expect(selectAllUnstagedCheckbox).toBeVisible()
      await selectAllUnstagedCheckbox.click()
      await page.waitForTimeout(300)

      // Verify batch stage button appears with "Stage (3)"
      const batchStageBtn = unstagedColumn.locator('[data-testid="batch-stage-btn"]')
      await expect(batchStageBtn).toBeVisible()
      await expect(batchStageBtn).toContainText('Stage (3)')

      // Click batch stage button
      await batchStageBtn.click()
      await page.waitForTimeout(500)

      // All 3 files should now be staged
      await expect(unstagedItems).toHaveCount(0)
      await expect(stagedItems).toHaveCount(3)

      // 2. Select individual checkboxes in staged column (select 2 files)
      const checkbox1 = stagedColumn.locator('[data-testid="checkbox-staged-file1.txt"]')
      const checkbox2 = stagedColumn.locator('[data-testid="checkbox-staged-file2.txt"]')

      await checkbox1.click()
      await checkbox2.click()
      await page.waitForTimeout(300)

      const batchUnstageBtn = stagedColumn.locator('[data-testid="batch-unstage-btn"]')
      await expect(batchUnstageBtn).toBeVisible()
      await expect(batchUnstageBtn).toContainText('Unstage (2)')

      // Click batch unstage button
      await batchUnstageBtn.click()
      await page.waitForTimeout(500)

      // 2 files back in unstaged, 1 remains staged
      await expect(unstagedItems).toHaveCount(2)
      await expect(stagedItems).toHaveCount(1)

      // 3. Batch discard unstaged files
      await selectAllUnstagedCheckbox.click()
      await page.waitForTimeout(300)

      const batchDiscardUnstagedBtn = unstagedColumn.locator('[data-testid="batch-discard-unstaged-btn"]')
      await expect(batchDiscardUnstagedBtn).toBeVisible()
      await batchDiscardUnstagedBtn.click()
      await page.waitForTimeout(500)

      // Discard confirmation dialog should appear
      const dialog = page.locator('[data-testid="discard-changes-dialog"]')
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText('2 selected files')

      // Confirm discard
      const confirmDiscardBtn = dialog.locator('button', { hasText: 'Discard' })
      await confirmDiscardBtn.click()
      await page.waitForTimeout(500)

      // Unstaged list should now be empty (0 files)
      await expect(unstagedItems).toHaveCount(0)
      await expect(stagedItems).toHaveCount(1)

      // 4. Batch discard staged files
      const stagedCheckbox = stagedColumn.locator('[data-testid="checkbox-staged-file3.txt"]')
      await stagedCheckbox.click()
      await page.waitForTimeout(300)

      // Create another staged file to test multi-selection discard in staged
      fs.writeFileSync(path.join(sandbox.dir, 'file4.txt'), 'File 4 content\n')
      await tabs.first().click()
      await page.waitForTimeout(300)
      await tabs.last().click()
      await page.waitForTimeout(300)

      // Stage file4.txt
      const stageFile4Btn = unstagedColumn.locator('.file-item', { hasText: 'file4.txt' }).locator('.stage-btn')
      await stageFile4Btn.click()
      await page.waitForTimeout(500)

      await expect(stagedItems).toHaveCount(2)

      // Select both staged files
      const selectAllStagedCheckbox = stagedColumn.locator('[data-testid="select-all-staged-checkbox"]')
      await selectAllStagedCheckbox.click()
      await page.waitForTimeout(300)

      // Click row discard button on one of the selected files
      const rowResetBtn = stagedColumn.locator('.file-item').first().locator('.reset-btn')
      await rowResetBtn.click()
      await page.waitForTimeout(500)

      // Should prompt for both staged files
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText('2 selected files')

      await confirmDiscardBtn.click()
      await page.waitForTimeout(500)

      // Staged list should now be empty
      await expect(stagedItems).toHaveCount(0)
    } finally {
      await app.close()
    }
  })
})

