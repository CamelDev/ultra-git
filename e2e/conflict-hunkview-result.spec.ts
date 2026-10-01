import { test, expect } from '@playwright/test'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'

test.describe('HunkView Result Pane Correctness', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])

    // Base: shared line
    await sandbox.createCommit('file.txt', 'Header\nBase line\nFooter\n', 'Base commit')

    // branch-a: changes the middle line
    await sandbox.createBranch('branch-a')
    await sandbox.createCommit('file.txt', 'Header\nAlpha change\nFooter\n', 'Change on branch-a')

    // branch-b: changes the middle line differently
    await sandbox.checkoutBranch('main')
    await sandbox.createBranch('branch-b')
    await sandbox.createCommit('file.txt', 'Header\nBravo change\nFooter\n', 'Change on branch-b')
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('HV3: "Both (Current first)" Result pane shows current then incoming', async () => {
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

      // Click "Both (Current first)"
      await page.locator('[data-testid="conflict-both-current-first"]').click()

      // Result pane must show BOTH lines, current first
      const resultPane = page.locator('[data-testid="conflict-result-pane"]')
      const resultText = await resultPane.textContent()

      expect(resultText).toContain('Bravo change')  // Current (branch-b)
      expect(resultText).toContain('Alpha change')  // Incoming (branch-a)

      // Verify ordering: current appears before incoming
      const bravoIdx = resultText!.indexOf('Bravo change')
      const alphaIdx = resultText!.indexOf('Alpha change')
      expect(bravoIdx).toBeLessThan(alphaIdx)

      // Also verify the full-file textarea reflects the same
      const resultEditor = page.locator('[data-testid="conflict-result-editor"]')
      await expect(resultEditor).toHaveValue(/Bravo change/)
      await expect(resultEditor).toHaveValue(/Alpha change/)
    } finally {
      await app.close()
    }
  })

  test('HV4: "Both (Incoming first)" Result pane shows incoming then current', async () => {
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

      // Click "Both (Incoming first)"
      await page.locator('[data-testid="conflict-both-incoming-first"]').click()

      // Result pane shows incoming before current
      const resultPane = page.locator('[data-testid="conflict-result-pane"]')
      const resultText = await resultPane.textContent()

      expect(resultText).toContain('Alpha change')   // Incoming (branch-a)
      expect(resultText).toContain('Bravo change')   // Current (branch-b)

      // Verify ordering: incoming before current
      const alphaIdx = resultText!.indexOf('Alpha change')
      const bravoIdx = resultText!.indexOf('Bravo change')
      expect(alphaIdx).toBeLessThan(bravoIdx)
    } finally {
      await app.close()
    }
  })
})
