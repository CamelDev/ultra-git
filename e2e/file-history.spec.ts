import { test, expect } from '@playwright/test'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import path from 'path'

test.describe('File History Dialog', () => {
  let sandbox: GitSandbox

  test.beforeAll(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()

    // Commit 1 by Alice: add app.ts
    await sandbox.git.addConfig('user.name', 'Alice Developer', false, 'local')
    await sandbox.git.addConfig('user.email', 'alice@example.com', false, 'local')
    await sandbox.createCommit(
      'src/app.ts',
      'export const version = 1\nexport const greeting = "hello"\n',
      'Initial app module'
    )

    // Commit 2 by Bob: update greeting
    await sandbox.git.addConfig('user.name', 'Bob Engineer', false, 'local')
    await sandbox.git.addConfig('user.email', 'bob@example.com', false, 'local')
    await sandbox.createCommit(
      'src/app.ts',
      'export const version = 2\nexport const greeting = "hello world"\n',
      'Enhance greeting message'
    )

    // Commit 3 by Alice: bump version
    await sandbox.git.addConfig('user.name', 'Alice Developer', false, 'local')
    await sandbox.git.addConfig('user.email', 'alice@example.com', false, 'local')
    await sandbox.createCommit(
      'src/app.ts',
      'export const version = 3\nexport const greeting = "hello world"\nexport const ready = true\n',
      'Add ready flag in v3'
    )
  })

  test.afterAll(async () => {
    await sandbox.destroy()
  })

  test('opens file history from diff modal, switches commits, searches by message/author, and copies commit hash', async () => {
    const { app, page } = await launchElectronApp()

    try {
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(800)

      await app.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath }
        })
      }, sandbox.dir)

      await addRepoViaUI(page)

      const expectedTabName = path.basename(sandbox.dir)
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs.last()).toContainText(expectedTabName)
      await tabs.last().click()
      await page.waitForTimeout(800)

      // Latest commit is selected by default; open diff for src/app.ts
      const fileItem = page.locator('.details-panel .file-item').filter({ hasText: 'src/app.ts' }).first()
      await expect(fileItem).toBeVisible()
      await fileItem.click()

      // Verify diff modal opens showing the most recent change by default
      const diffModal = page.locator('.diff-modal-overlay')
      await expect(diffModal).toBeVisible()
      await expect(diffModal).toContainText('export const ready = true')

      // Verify History button is positioned between "Code view" toggle and file path
      const codeViewBtn = page.locator('[data-testid="toggle-code-view-btn"]')
      const historyBtn = page.locator('[data-testid="file-history-btn"]')
      const filePathEl = page.locator('[data-testid="diff-file-path"]')

      await expect(codeViewBtn).toBeVisible()
      await expect(historyBtn).toBeVisible()
      await expect(filePathEl).toBeVisible()

      const [codeBox, historyBox, pathBox] = await Promise.all([
        codeViewBtn.boundingBox(),
        historyBtn.boundingBox(),
        filePathEl.boundingBox()
      ])
      expect(codeBox).not.toBeNull()
      expect(historyBox).not.toBeNull()
      expect(pathBox).not.toBeNull()
      expect(historyBox!.x).toBeGreaterThan(codeBox!.x)
      expect(pathBox!.x).toBeGreaterThan(historyBox!.x)

      // Open File History dialog
      await historyBtn.click()
      const historyModal = page.locator('[data-testid="file-history-modal"]')
      await expect(historyModal).toBeVisible()

      // Verify left commit list and right diff pane are visible
      const commitItems = page.locator('[data-testid="file-history-commit-item"]')
      await expect(commitItems).toHaveCount(3)
      await expect(commitItems.nth(0)).toContainText('Add ready flag in v3')
      await expect(commitItems.nth(1)).toContainText('Enhance greeting message')
      await expect(commitItems.nth(2)).toContainText('Initial app module')

      const diffPane = page.locator('[data-testid="file-history-diff-pane"]')
      await expect(diffPane).toContainText('export const ready = true')

      // Select the second commit ("Enhance greeting message") and verify right diff updates
      await commitItems.nth(1).click()
      await expect(commitItems.nth(1)).toHaveClass(/active/)
      await expect(diffPane).toContainText('hello world')
      await expect(diffPane).not.toContainText('export const ready = true')

      // Search by commit message
      const searchInput = page.locator('[data-testid="file-history-search-input"]')
      await searchInput.fill('Initial app')
      await expect(commitItems).toHaveCount(1)
      await expect(commitItems.first()).toContainText('Initial app module')
      await expect(diffPane).toContainText('export const version = 1')

      // Search by author name
      await searchInput.fill('Bob Engineer')
      await expect(commitItems).toHaveCount(1)
      await expect(commitItems.first()).toContainText('Enhance greeting message')

      // Clear search
      await page.locator('[data-testid="file-history-search-clear"]').click()
      await expect(commitItems).toHaveCount(3)

      // Copy commit hash from the first commit item and verify clipboard contains full 40-char SHA
      const expectedHash = await commitItems.first().getAttribute('data-commit-hash')
      expect(expectedHash).toBeTruthy()
      expect(expectedHash!.length).toBe(40)

      await commitItems.first().locator('[data-testid="file-history-copy-hash-btn"]').click()
      const clipboardText = await app.evaluate(async ({ clipboard }) => clipboard.readText())
      expect(clipboardText).toBe(expectedHash)

      // Press Escape: closes File History dialog, keeps underlying DiffModal open
      await page.keyboard.press('Escape')
      await expect(historyModal).not.toBeVisible()
      await expect(diffModal).toBeVisible()
    } finally {
      await app.close()
    }
  })
})
