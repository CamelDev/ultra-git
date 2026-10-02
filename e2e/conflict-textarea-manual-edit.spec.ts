import { test, expect } from '@playwright/test'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import fs from 'fs'
import path from 'path'

test.describe('Textarea Manual Edit Persistence', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])

    await sandbox.createCommit('editable.txt', 'Line 1\nBase content\nLine 3\n', 'Base commit')
    await sandbox.createBranch('branch-a')
    await sandbox.createCommit('editable.txt', 'Line 1\nBranch A content\nLine 3\n', 'Branch A')
    await sandbox.checkoutBranch('main')
    await sandbox.createBranch('branch-b')
    await sandbox.createCommit('editable.txt', 'Line 1\nBranch B content\nLine 3\n', 'Branch B')
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('TE1: user types custom text in textarea -> Apply writes that content to disk', async () => {
    const { app, page } = await launchElectronApp()
    try {
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      await app.evaluate(async ({ ipcMain }, p) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => ({ canceled: false, path: p }))
      }, sandbox.dir)
      await addRepoViaUI(page)

      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // Trigger merge conflict
      const branchItem = page.locator('[data-testid="sidebar-branch-branch-a"]')
      await branchItem.hover()
      await page.locator('[data-testid="merge-branch-btn-branch-a"]').dispatchEvent('click')
      await page.locator('.diff-modal-overlay').locator('[data-testid="confirm-merge-btn"]').click()

      const resolver = page.locator('[data-testid="conflict-resolver"]')
      await expect(resolver).toBeVisible()

      // First, resolve via a choice so all regions are "resolved" (enabling Apply)
      await page.locator('[data-testid="conflict-current"]').click()

      // Now manually edit the textarea with custom content
      const resultEditor = page.locator('[data-testid="conflict-result-editor"]')
      await resultEditor.fill('Line 1\nMANUALLY EDITED CONTENT\nLine 3\n')

      // Apply & Stage
      await page.locator('[data-testid="conflict-apply-stage"]').click()
      await page.waitForTimeout(800)

      // Continue merge
      const continueBtn = resolver.locator('[data-testid="conflict-continue-btn"]')
      await continueBtn.click()
      await expect(resolver).toBeHidden()
      await page.waitForTimeout(1000)

      // Critical assertion: the file must contain the MANUALLY typed content
      const content = fs.readFileSync(path.join(sandbox.dir, 'editable.txt'), 'utf8')
      expect(content).toContain('MANUALLY EDITED CONTENT')
      expect(content).not.toContain('Branch B content')
    } finally {
      await app.close()
    }
  })

  test('TE2: textarea edits preserved across file navigation', async () => {
    // Add a second conflicting file
    await sandbox.checkoutBranch('branch-a')
    await sandbox.createCommit('second.txt', 'Alpha\n', 'Add second on branch-a')
    await sandbox.checkoutBranch('branch-b')
    await sandbox.createCommit('second.txt', 'Bravo\n', 'Add second on branch-b')

    const { app, page } = await launchElectronApp()
    try {
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      await app.evaluate(async ({ ipcMain }, p) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => ({ canceled: false, path: p }))
      }, sandbox.dir)
      await addRepoViaUI(page)

      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // Trigger merge conflict (2 files)
      const branchItem = page.locator('[data-testid="sidebar-branch-branch-a"]')
      await branchItem.hover()
      await page.locator('[data-testid="merge-branch-btn-branch-a"]').dispatchEvent('click')
      await page.locator('.diff-modal-overlay').locator('[data-testid="confirm-merge-btn"]').click()

      const resolver = page.locator('[data-testid="conflict-resolver"]')
      await expect(resolver).toBeVisible()

      // Select editable.txt, resolve region, then type custom content
      await page.locator('[data-testid="conflict-file-editable.txt"]').click()
      await page.locator('[data-testid="conflict-current"]').click()
      const resultEditor = page.locator('[data-testid="conflict-result-editor"]')
      await resultEditor.fill('CUSTOM DRAFT TEXT\n')

      // Switch to second.txt
      await page.locator('[data-testid="conflict-file-second.txt"]').click()
      await page.waitForTimeout(300)

      // Switch back to editable.txt
      await page.locator('[data-testid="conflict-file-editable.txt"]').click()
      await page.waitForTimeout(300)

      // Assertion: custom text is still in the textarea
      await expect(resultEditor).toHaveValue('CUSTOM DRAFT TEXT\n')
    } finally {
      await app.close()
    }
  })
})
