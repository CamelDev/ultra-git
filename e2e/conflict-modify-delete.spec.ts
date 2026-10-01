import { test, expect } from '@playwright/test'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import fs from 'fs'
import path from 'path'

test.describe('Modify/Delete Conflict Resolution', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])

    // Base commit with a shared file
    await sandbox.createCommit('target.txt', 'Line 1\nLine 2\nLine 3\n', 'Add target file')

    // branch-a: DELETES the file
    await sandbox.createBranch('branch-a')
    fs.unlinkSync(path.join(sandbox.dir, 'target.txt'))
    await sandbox.git.add('target.txt')
    await sandbox.git.commit('Delete target.txt on branch-a')

    // main (branch-b): MODIFIES the file
    await sandbox.checkoutBranch('main')
    await sandbox.createBranch('branch-b')
    await sandbox.createCommit('target.txt', 'Line 1\nModified Line 2\nLine 3\n', 'Modify target.txt on branch-b')
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('MD1: choosing "keep modified" side stages the file with content', async () => {
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

      // Merge branch-a (deleter) into branch-b (modifier)
      const branchItem = page.locator('[data-testid="sidebar-branch-branch-a"]')
      await expect(branchItem).toBeVisible()
      await branchItem.hover()
      await page.locator('[data-testid="merge-branch-btn-branch-a"]').dispatchEvent('click')

      const modal = page.locator('.diff-modal-overlay')
      await expect(modal).toBeVisible()
      await modal.locator('[data-testid="confirm-merge-btn"]').click()

      // Workbench should auto-open with the conflict
      const resolver = page.locator('[data-testid="conflict-resolver"]')
      await expect(resolver).toBeVisible()

      const fileItem = page.locator('[data-testid="conflict-file-target.txt"]')
      await expect(fileItem).toBeVisible()

      // Choose "Use Current" -> keep the modified version
      await page.locator('[data-testid="conflict-current"]').click()
      const resultEditor = page.locator('[data-testid="conflict-result-editor"]')
      await expect(resultEditor).toHaveValue(/Modified Line 2/)

      // Apply & Stage
      await page.locator('[data-testid="conflict-apply-stage"]').click()
      await page.waitForTimeout(800)

      // Continue merge
      const continueBtn = resolver.locator('[data-testid="conflict-continue-btn"]')
      await expect(continueBtn).toBeEnabled()
      await continueBtn.click()
      await expect(resolver).toBeHidden()
      await page.waitForTimeout(1000)

      // Assertion: file exists on disk with our content
      expect(fs.existsSync(path.join(sandbox.dir, 'target.txt'))).toBe(true)
      const content = fs.readFileSync(path.join(sandbox.dir, 'target.txt'), 'utf8')
      expect(content).toContain('Modified Line 2')

      const status = await sandbox.git.status()
      expect(status.conflicted).toHaveLength(0)
    } finally {
      await app.close()
    }
  })

  test('MD2: choosing "delete" side removes the file from index (not 0-byte)', async () => {
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

      // Merge branch-a (deleter) into branch-b (modifier)
      const branchItem = page.locator('[data-testid="sidebar-branch-branch-a"]')
      await branchItem.hover()
      await page.locator('[data-testid="merge-branch-btn-branch-a"]').dispatchEvent('click')
      const modal = page.locator('.diff-modal-overlay')
      await modal.locator('[data-testid="confirm-merge-btn"]').click()

      const resolver = page.locator('[data-testid="conflict-resolver"]')
      await expect(resolver).toBeVisible()

      // Choose "Use Incoming" -> accept the deletion
      await page.locator('[data-testid="conflict-incoming"]').click()

      // Apply & Stage
      await page.locator('[data-testid="conflict-apply-stage"]').click()
      await page.waitForTimeout(800)

      // Continue merge
      const continueBtn = resolver.locator('[data-testid="conflict-continue-btn"]')
      await expect(continueBtn).toBeEnabled()
      await continueBtn.click()
      await expect(resolver).toBeHidden()
      await page.waitForTimeout(1000)

      // Critical assertion: file must NOT exist (not a 0-byte file)
      expect(fs.existsSync(path.join(sandbox.dir, 'target.txt'))).toBe(false)

      const lsFiles = await sandbox.git.raw(['ls-files', 'target.txt'])
      expect(lsFiles.trim()).toBe('')

      const status = await sandbox.git.status()
      expect(status.conflicted).toHaveLength(0)
    } finally {
      await app.close()
    }
  })

  test('MD3: undo after delete-side resolution restores conflict state', async () => {
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
      const modal = page.locator('.diff-modal-overlay')
      await modal.locator('[data-testid="confirm-merge-btn"]').click()

      const resolver = page.locator('[data-testid="conflict-resolver"]')
      await expect(resolver).toBeVisible()

      // Choose incoming (delete) and apply
      await page.locator('[data-testid="conflict-incoming"]').click()
      await page.locator('[data-testid="conflict-apply-stage"]').click()
      await page.waitForTimeout(800)

      // File icon should show resolved
      const fileItem = page.locator('[data-testid="conflict-file-target.txt"]')
      await expect(fileItem.locator('.lucide-circle-check-big')).toBeVisible()

      // Click Undo Resolution
      const undoBtn = page.getByRole('button', { name: 'Undo Resolution' })
      await expect(undoBtn).toBeEnabled()
      await undoBtn.click()
      await page.waitForTimeout(800)

      // Assertion: file is back in conflicted state
      await expect(fileItem.locator('.lucide-circle-check-big')).not.toBeVisible()

      const continueBtn = resolver.locator('[data-testid="conflict-continue-btn"]')
      await expect(continueBtn).toBeDisabled()

      const status = await sandbox.git.status()
      expect(status.conflicted).toContain('target.txt')
    } finally {
      await app.close()
    }
  })
})
