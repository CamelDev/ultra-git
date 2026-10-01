import { test, expect } from '@playwright/test'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import fs from 'fs'
import path from 'path'

function fakeBinary(label: string): Buffer {
  const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
  const body = Buffer.from(label, 'utf8')
  const nulls = Buffer.alloc(16, 0x00)
  return Buffer.concat([header, body, nulls])
}

test.describe('Binary Conflict Resolution', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])

    // Base binary file
    fs.writeFileSync(path.join(sandbox.dir, 'image.png'), fakeBinary('BASE'))
    await sandbox.git.add('image.png')
    await sandbox.git.commit('Add base binary file')

    // branch-a modifies the binary
    await sandbox.createBranch('branch-a')
    fs.writeFileSync(path.join(sandbox.dir, 'image.png'), fakeBinary('BRANCH_A'))
    await sandbox.git.add('image.png')
    await sandbox.git.commit('Modify binary on branch-a')

    // branch-b modifies the binary differently
    await sandbox.checkoutBranch('main')
    await sandbox.createBranch('branch-b')
    fs.writeFileSync(path.join(sandbox.dir, 'image.png'), fakeBinary('BRANCH_B'))
    await sandbox.git.add('image.png')
    await sandbox.git.commit('Modify binary on branch-b')
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('BIN1+BIN2: binary conflict detected, Keep Current resolves with our binary', async () => {
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

      // Merge branch-a into branch-b -> binary conflict
      const branchItem = page.locator('[data-testid="sidebar-branch-branch-a"]')
      await branchItem.hover()
      await page.locator('[data-testid="merge-branch-btn-branch-a"]').dispatchEvent('click')
      await page.locator('.diff-modal-overlay').locator('[data-testid="confirm-merge-btn"]').click()

      const resolver = page.locator('[data-testid="conflict-resolver"]')
      await expect(resolver).toBeVisible()

      // The hunk view should show the binary message instead of text diff panes
      const binaryMsg = page.locator('.conflict-empty')
      await expect(binaryMsg).toContainText('Binary')

      // File-level action buttons should be visible
      const keepCurrentBtn = page.locator('[data-testid="conflict-keep-current"]')
      const keepIncomingBtn = page.locator('[data-testid="conflict-keep-incoming"]')
      await expect(keepCurrentBtn).toBeVisible()
      await expect(keepIncomingBtn).toBeVisible()

      // Choose "Keep Current file"
      await keepCurrentBtn.click()

      // Apply & Stage should be enabled
      const applyBtn = page.locator('[data-testid="conflict-apply-stage"]')
      await expect(applyBtn).toBeEnabled()
      await applyBtn.click()
      await page.waitForTimeout(800)

      // Continue merge
      await page.getByRole('button', { name: 'Continue' }).click()
      await expect(resolver).toBeHidden()
      await page.waitForTimeout(1000)

      // Assertion: file contains branch-b's binary content
      const content = fs.readFileSync(path.join(sandbox.dir, 'image.png'))
      expect(content.includes(Buffer.from('BRANCH_B'))).toBe(true)
      expect(content.includes(Buffer.from('BRANCH_A'))).toBe(false)

      const status = await sandbox.git.status()
      expect(status.conflicted).toHaveLength(0)
    } finally {
      await app.close()
    }
  })

  test('BIN3: Keep Incoming resolves with their binary', async () => {
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

      // Merge branch-a into branch-b -> binary conflict
      const branchItem = page.locator('[data-testid="sidebar-branch-branch-a"]')
      await branchItem.hover()
      await page.locator('[data-testid="merge-branch-btn-branch-a"]').dispatchEvent('click')
      await page.locator('.diff-modal-overlay').locator('[data-testid="confirm-merge-btn"]').click()

      const resolver = page.locator('[data-testid="conflict-resolver"]')
      await expect(resolver).toBeVisible()

      // Choose "Keep Incoming file" (branch-a's binary)
      await page.locator('[data-testid="conflict-keep-incoming"]').click()
      await page.locator('[data-testid="conflict-apply-stage"]').click()
      await page.waitForTimeout(800)

      await page.getByRole('button', { name: 'Continue' }).click()
      await expect(resolver).toBeHidden()
      await page.waitForTimeout(1000)

      // Assertion: file contains branch-a's binary content
      const content = fs.readFileSync(path.join(sandbox.dir, 'image.png'))
      expect(content.includes(Buffer.from('BRANCH_A'))).toBe(true)
      expect(content.includes(Buffer.from('BRANCH_B'))).toBe(false)
    } finally {
      await app.close()
    }
  })
})
