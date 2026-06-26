import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import path from 'path'
import fs from 'fs'

test.describe('Branch Sync Status', () => {
  let localSandbox: GitSandbox
  let remoteSandbox: GitSandbox

  test.beforeEach(async () => {
    // Initialize remote repository (acting as upstream)
    remoteSandbox = new GitSandbox()
    await remoteSandbox.init()
    await remoteSandbox.git.branch(['-M', 'main'])

    // Initialize local repository by cloning the remote sandbox
    localSandbox = new GitSandbox()
    fs.rmSync(localSandbox.dir, { recursive: true, force: true })
    
    const baseGit = require('simple-git')()
    await baseGit.clone(remoteSandbox.dir, localSandbox.dir)
    
    // Configure local sandbox user info
    await localSandbox.git.addConfig('user.name', 'Test User', false, 'local')
    await localSandbox.git.addConfig('user.email', 'test@example.com', false, 'local')

    // Allow pushing to checked-out branch on remote sandbox for ease of testing
    await remoteSandbox.git.addConfig('receive.denyCurrentBranch', 'ignore', false, 'local')
  })

  test.afterEach(async () => {
    await localSandbox.destroy()
    await remoteSandbox.destroy()
  })

  test('should display ahead/behind badges in the sidebar and empty/globe icons in the log', async () => {
    // 1. Create a diverged state: local is ahead by 2, behind by 1
    // A) Create 2 local commits (ahead)
    await localSandbox.createCommit('file-local-1.txt', 'local 1', 'Local commit 1')
    await localSandbox.createCommit('file-local-2.txt', 'local 2', 'Local commit 2')

    // B) Create 1 remote commit (behind)
    // We checkout main on remote, make commit
    await remoteSandbox.createCommit('file-remote-1.txt', 'remote 1', 'Remote commit 1')

    // C) Fetch remote changes to local repository so remote-tracking branch origin/main updates
    await localSandbox.git.fetch()

    // Launch the Electron App
    const { app, page } = await launchElectronApp()
    
    try {
      // Clear localStorage
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Mock openDirectory dialog to load local sandbox repo
      await app.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath }
        })
      }, localSandbox.dir)

      // Click to add repository
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()

      // Switch to the newly added repository tab
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000) // wait for git log and status load

      // 2. Verify sidebar indicators next to the branch
      const syncBadge = page.locator('[data-testid="branch-sync-badge"]')
      await expect(syncBadge).toBeVisible()

      const aheadBadge = page.locator('[data-testid="sync-ahead"]')
      await expect(aheadBadge).toBeVisible()
      await expect(aheadBadge).toContainText('↑2')

      const behindBadge = page.locator('[data-testid="sync-behind"]')
      await expect(behindBadge).toBeVisible()
      await expect(behindBadge).toContainText('↓1')

      // 3. Verify commit log markers in GraphView
      // Ahead commits should show as local-only circles (empty center)
      const localOnlyCircles = page.locator('[data-testid="commit-local-only-circle"]')
      await expect(localOnlyCircles.first()).toBeVisible({ timeout: 5000 })
      await expect(localOnlyCircles).toHaveCount(2)

      // Behind commits should show as remote-only globe icons
      const remoteGlobeIcons = page.locator('[data-testid="commit-globe-icon"]')
      await expect(remoteGlobeIcons.first()).toBeVisible({ timeout: 5000 })
      await expect(remoteGlobeIcons).toHaveCount(1)

      // Synchronized commits (Initial commit) should show as pushed circles (solid)
      const pushedCircles = page.locator('[data-testid="commit-pushed-circle"]')
      await expect(pushedCircles.first()).toBeVisible({ timeout: 5000 })
      await expect(pushedCircles).toHaveCount(1)

    } finally {
      await app.close()
    }
  })

  test('should pull remote changes and push local changes successfully', async () => {
    // Local commit
    await localSandbox.createCommit('file-local.txt', 'local content', 'Local commit')

    // Remote commit
    await remoteSandbox.createCommit('file-remote.txt', 'remote content', 'Remote commit')

    // Fetch to update remote tracking branch
    await localSandbox.git.fetch()

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
        ipcMain.removeHandler('dialog:showMessageBox')
        ipcMain.handle('dialog:showMessageBox', async () => {
          return { success: true, response: 0 }
        })
      }, localSandbox.dir)

      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await addBtn.click()

      const tabs = page.locator('[data-testid="repo-tab"]')
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // Verify sync actions panel is visible
      const syncPanel = page.locator('[data-testid="sync-actions-panel"]')
      await expect(syncPanel).toBeVisible()

      // Pull button and behind count should be visible
      const pullBtn = page.locator('[data-testid="pull-btn"]')
      await expect(pullBtn).toBeVisible()
      const pullBehindBadge = page.locator('[data-testid="pull-behind-count"]')
      await expect(pullBehindBadge).toBeVisible()
      await expect(pullBehindBadge).toContainText('1')

      // Push button and ahead count should be visible
      const pushBtn = page.locator('[data-testid="push-btn"]')
      await expect(pushBtn).toBeVisible()
      const pushAheadBadge = page.locator('[data-testid="push-ahead-count"]')
      await expect(pushAheadBadge).toBeVisible()
      await expect(pushAheadBadge).toContainText('1')

      // Click Pull
      await pullBtn.click()
      await expect(pullBtn).toBeEnabled({ timeout: 15000 }) // Wait for pull to complete and refresh

      // Pull behind badge should be gone
      await expect(pullBehindBadge).not.toBeVisible()

      // Click Push
      await pushBtn.click()
      await expect(pushBtn).toBeEnabled({ timeout: 15000 }) // Wait for push to complete and refresh

      // Push ahead badge should be gone
      await expect(pushAheadBadge).not.toBeVisible()

    } finally {
      await app.close()
    }
  })

  test('should display conflict warning banner when pull encounters conflicts', async () => {
    // Both modify the same file with different content to cause a conflict
    await localSandbox.createCommit('conflict-file.txt', 'local version', 'Local conflicting commit')

    await remoteSandbox.createCommit('conflict-file.txt', 'remote version', 'Remote conflicting commit')

    // Fetch to update remote tracking branch
    await localSandbox.git.fetch()

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
      }, localSandbox.dir)

      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await addBtn.click()

      const tabs = page.locator('[data-testid="repo-tab"]')
      await tabs.last().click()
      await page.waitForTimeout(1000)

      const pullBtn = page.locator('[data-testid="pull-btn"]')
      
      // Mock message box response so it doesn't block the test
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('dialog:showMessageBox')
        ipcMain.handle('dialog:showMessageBox', async () => {
          return { success: true, response: 0 }
        })
      })

      // Click Pull to cause conflict
      await pullBtn.click()
      await expect(pullBtn).toBeEnabled({ timeout: 15000 })

      // Conflict banner should be visible
      const conflictBanner = page.locator('[data-testid="pull-conflict-banner"]')
      await expect(conflictBanner).toBeVisible()
      await expect(conflictBanner).toContainText('Merge conflicts detected')

    } finally {
      await app.close()
    }
  })
})
