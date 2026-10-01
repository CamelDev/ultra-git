import { test, expect } from '@playwright/test'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import fs from 'fs'
import path from 'path'

test.describe('Both-Added Conflict Resolution', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])

    // Create branch-a that adds a NEW file
    await sandbox.createBranch('branch-a')
    await sandbox.createCommit('newfile.txt', 'Content from branch A\nLine 2 A\n', 'Add newfile on branch-a')

    // Switch back to main and create branch-b that adds a file at the SAME path
    await sandbox.checkoutBranch('main')
    await sandbox.createBranch('branch-b')
    await sandbox.createCommit('newfile.txt', 'Content from branch B\nLine 2 B\n', 'Add newfile on branch-b')
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('merge both-added: workbench opens, regions are derived over empty base, resolution commits', async () => {
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

      // Trigger merge of branch-a into branch-b
      const branchItem = page.locator('[data-testid="sidebar-branch-branch-a"]')
      await expect(branchItem).toBeVisible()
      await branchItem.hover()
      await page.locator('[data-testid="merge-branch-btn-branch-a"]').dispatchEvent('click')

      const modal = page.locator('.diff-modal-overlay')
      await expect(modal).toBeVisible()
      await modal.locator('[data-testid="confirm-merge-btn"]').click()

      // Workbench auto-opens
      const resolver = page.locator('[data-testid="conflict-resolver"]')
      await expect(resolver).toBeVisible()

      // Verify the file is listed
      const fileItem = page.locator('[data-testid="conflict-file-newfile.txt"]')
      await expect(fileItem).toBeVisible()

      // Base pane should show (empty) since no common ancestor
      const basePane = page.locator('[data-testid="conflict-base-pane"]')
      await expect(basePane).toContainText('(empty)')

      // Current pane shows branch-b's content, Incoming shows branch-a's
      const currentPane = page.locator('[data-testid="conflict-current-pane"]')
      await expect(currentPane).toContainText('Content from branch B')
      const incomingPane = page.locator('[data-testid="conflict-incoming-pane"]')
      await expect(incomingPane).toContainText('Content from branch A')

      // Choose "Use Incoming" to accept branch-a's version
      await page.locator('[data-testid="conflict-incoming"]').click()
      const resultEditor = page.locator('[data-testid="conflict-result-editor"]')
      await expect(resultEditor).toHaveValue(/Content from branch A/)

      // Apply & Stage
      await page.locator('[data-testid="conflict-apply-stage"]').click()
      await page.waitForTimeout(800)

      // Continue merge
      const continueBtn = page.getByRole('button', { name: 'Continue' })
      await expect(continueBtn).toBeEnabled()
      await continueBtn.click()
      await expect(resolver).toBeHidden()

      // Verify git state
      const status = await sandbox.git.status()
      expect(status.conflicted).toHaveLength(0)
      expect(status.files).toHaveLength(0)
      const content = fs.readFileSync(path.join(sandbox.dir, 'newfile.txt'), 'utf8')
      expect(content).toContain('Content from branch A')
    } finally {
      await app.close()
    }
  })

  test('cherry-pick both-added: workbench opens with cherry-pick header, abort works', async () => {
    await sandbox.checkoutBranch('main')
    await sandbox.createCommit('newfile.txt', 'Content from main\n', 'Add newfile on main')

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
      await page.waitForTimeout(500)

      // Open cherry-pick modal
      await page.locator('[data-testid="cherry-pick-btn"]').click()
      const branchSelect = page.locator('[data-testid="cherry-pick-branch-select"]')
      await expect(branchSelect).toBeVisible()
      await branchSelect.selectOption('branch-a')
      await page.waitForTimeout(300)

      // Pick the commit
      await page.locator('[data-testid="cherry-pick-action-btn"]').click()

      // Workbench should open with cherry-pick header
      const resolver = page.locator('[data-testid="conflict-resolver"]')
      await expect(resolver).toBeVisible()
      await expect(resolver.locator('span:has-text("Cherry-pick in progress")')).toBeVisible()

      // Abort cherry-pick
      const abortBtn = page.locator('[data-testid="abort-merge-btn"]')
      await expect(abortBtn).toContainText('Abort Cherry-pick')
      await abortBtn.click()
      await expect(resolver).not.toBeVisible()

      // Verify CHERRY_PICK_HEAD is gone
      expect(fs.existsSync(path.join(sandbox.dir, '.git', 'CHERRY_PICK_HEAD'))).toBe(false)
    } finally {
      await app.close()
    }
  })
})
