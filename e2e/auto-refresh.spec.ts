import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import path from 'path'
import fs from 'fs'

test.describe('FS Watcher Auto-Refresh', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('should automatically detect filesystem changes and refresh git status', async () => {
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

      // 1. Verify that no changes are shown initially
      const panel = page.locator('[data-testid="active-changes-panel"]')
      await expect(panel).not.toBeVisible()

      // 2. Write a new file directly to the sandbox directory to trigger watcher
      console.log('Writing file in sandbox directory:', sandbox.dir)
      fs.writeFileSync(path.join(sandbox.dir, 'auto-change.txt'), 'Auto refresh content')

      // 3. Wait for the watcher to debounce and trigger refresh (300ms debounce + IPC latency)
      await page.waitForTimeout(1500)

      // 4. Verify that the active changes panel became visible automatically
      await expect(panel).toBeVisible()

      // Check Changed files column contents and ensure 'auto-change.txt' is listed
      const unstagedColumn = panel.locator('.unstaged-column')
      const unstagedItems = unstagedColumn.locator('.file-item')
      await expect(unstagedItems).toHaveCount(1)
      await expect(unstagedItems.first()).toContainText('auto-change.txt')

    } finally {
      await app.close()
    }
  })
})
