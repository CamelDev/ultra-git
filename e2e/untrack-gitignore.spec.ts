import { test, expect } from '@playwright/test'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import path from 'path'
import fs from 'fs'

test.describe('Untrack and .gitignore Management E2E', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('should detect tracked ignored file, show warning badge, and untrack it without deleting disk file', async () => {
    const { app, page } = await launchElectronApp()
    try {
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Commit a file that will later be ignored
      await sandbox.createCommit('.run/config.xml', '<config>v1</config>', 'Add run config')

      // Put .run/ in .gitignore
      fs.writeFileSync(path.join(sandbox.dir, '.gitignore'), '.run/\n')

      // Modify the file so it appears in unstaged changes
      fs.writeFileSync(path.join(sandbox.dir, '.run/config.xml'), '<config>v2</config>')

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
      await page.waitForTimeout(500)

      // Verify active changes panel is visible
      const panel = page.locator('[data-testid="active-changes-panel"]')
      await expect(panel).toBeVisible()

      // Verify .run/config.xml appears with Tracked · Ignored badge
      const badge = page.locator('.tracked-ignored-badge')
      await expect(badge).toBeVisible()
      await expect(badge).toContainText('Tracked · Ignored')

      // Click untrack button
      const untrackBtn = page.locator('[data-testid="untrack-btn-.run/config.xml"]')
      await expect(untrackBtn).toBeVisible()
      await untrackBtn.click()

      await page.waitForTimeout(1000)

      // Verify file still exists on disk!
      const diskContent = fs.readFileSync(path.join(sandbox.dir, '.run/config.xml'), 'utf-8')
      expect(diskContent).toBe('<config>v2</config>')

      // Staged changes should now show deletion in git index
      const stagedList = page.locator('.active-file-list').last()
      await expect(stagedList).toContainText('.run/config.xml')
    } finally {
      await app.close()
    }
  })

  test('should open Add to .gitignore dialog and append selected pattern to .gitignore', async () => {
    const { app, page } = await launchElectronApp()
    try {
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Create an untracked file
      fs.writeFileSync(path.join(sandbox.dir, 'debug.log'), 'test log output\n')

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

      // Click ignore button
      const ignoreBtn = page.locator('[data-testid="ignore-btn-debug.log"]')
      await expect(ignoreBtn).toBeVisible()
      await ignoreBtn.click()

      // Dialog should appear
      const dialog = page.locator('[data-testid="add-gitignore-dialog"]')
      await expect(dialog).toBeVisible()

      // Confirm add to .gitignore
      const confirmBtn = page.locator('[data-testid="add-gitignore-dialog-action-add"]')
      await confirmBtn.click()

      await page.waitForTimeout(1000)

      // Verify .gitignore file was created and contains debug.log
      const gitignoreContent = fs.readFileSync(path.join(sandbox.dir, '.gitignore'), 'utf-8')
      expect(gitignoreContent).toContain('debug.log')
    } finally {
      await app.close()
    }
  })

  test('should show staging conflict dialog when trying to stage an ignored tracked file', async () => {
    const { app, page } = await launchElectronApp()
    try {
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Commit a tracked file inside a directory
      await sandbox.createCommit('.run/settings.xml', '<settings>v1</settings>', 'Add settings')

      // Put .run/ into .gitignore
      fs.writeFileSync(path.join(sandbox.dir, '.gitignore'), '.run/\n')

      // Modify .run/settings.xml
      fs.writeFileSync(path.join(sandbox.dir, '.run/settings.xml'), '<settings>v2</settings>')

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

      // Click the regular stage button for .run/settings.xml
      const stageBtn = page.locator('[data-testid="stage-btn-.run/settings.xml"]')
      await stageBtn.click({ force: true })

      // The Staging Conflict dialog must appear!
      const conflictDialog = page.locator('[data-testid="staging-conflict-dialog"]')
      await expect(conflictDialog).toBeVisible()
      await expect(conflictDialog).toContainText('matches a pattern in .gitignore')

      // Click "Untrack & Keep on Disk" in the dialog
      const untrackAction = page.locator('[data-testid="staging-conflict-dialog-action-untrack"]')
      await expect(untrackAction).toBeVisible()
      await untrackAction.click()

      await page.waitForTimeout(1000)

      // File should still be present on disk with updated contents
      const fileOnDisk = fs.readFileSync(path.join(sandbox.dir, '.run/settings.xml'), 'utf-8')
      expect(fileOnDisk).toBe('<settings>v2</settings>')

      // Conflict dialog should have closed
      await expect(conflictDialog).not.toBeVisible()
    } finally {
      await app.close()
    }
  })
})
