import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'

test.describe('Branch Filtering in Sidebar', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])
    
    // Create multiple branches with different names and folder structures
    await sandbox.createBranch('dev')
    await sandbox.checkoutBranch('main')
    
    await sandbox.createBranch('feature/abc')
    await sandbox.checkoutBranch('main')
    
    await sandbox.createBranch('feature/xyz')
    await sandbox.checkoutBranch('main')
    
    await sandbox.createBranch('bugfix/123')
    await sandbox.checkoutBranch('main')

    // Create a dummy remote tracking branch as well
    await sandbox.git.raw(['update-ref', 'refs/remotes/origin/main', 'HEAD'])
    await sandbox.git.raw(['update-ref', 'refs/remotes/origin/feature/remote-abc', 'HEAD'])
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('should filter local and remote branches dynamically', async () => {
    console.log('1. Launching Electron App...')
    const { app, page } = await launchElectronApp()

    try {
      console.log('2. Clearing localStorage...')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      console.log('3. Mocking dialog:openDirectory...')
      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, sandbox.dir)

      console.log('4. Clicking to add repository...')
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()

      console.log('5. Switching to the newly added repository tab...')
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // Locate filter input
      const filterInput = page.locator('[data-testid="branch-filter-input"]')
      await expect(filterInput).toBeVisible()

      // Local & remote sections
      const localSection = page.locator('.sidebar-section:has-text("Local")')
      const remoteSection = page.locator('.sidebar-section:has-text("Remote")')

      // Verify initial branch counts (5 local, 2 remote)
      // Local branches: main, dev, feature/abc, feature/xyz, bugfix/123 (Total = 5)
      await expect(localSection.locator('.sidebar-header')).toContainText('5')
      await expect(remoteSection.locator('.sidebar-header')).toContainText('2')

      // Initially, we shouldn't see 'feature/abc' leaf node directly if 'feature' directory is collapsed,
      // but let's test filtering directly since it auto-expands folder nodes.
      console.log('6. Typing "feature" into filter...')
      await filterInput.fill('feature')
      await page.waitForTimeout(500)

      // Verified filtered counts (feature/abc and feature/xyz match => 2 local branches)
      // Remote branches: origin/feature/remote-abc matches => 1 remote branch
      await expect(localSection.locator('.sidebar-header')).toContainText('2/5')
      await expect(remoteSection.locator('.sidebar-header')).toContainText('1/2')

      // Verify matching branches are visible
      await expect(page.locator('[data-testid="sidebar-branch-feature/abc"]')).toBeVisible()
      await expect(page.locator('[data-testid="sidebar-branch-feature/xyz"]')).toBeVisible()
      await expect(page.locator('[data-testid="sidebar-remote-branch-origin/feature/remote-abc"]')).toBeVisible()

      // Verify non-matching branches are hidden
      await expect(page.locator('[data-testid="sidebar-branch-dev"]')).not.toBeVisible()
      await expect(page.locator('[data-testid="sidebar-branch-bugfix/123"]')).not.toBeVisible()

      console.log('7. Typing a query with no matches...')
      await filterInput.fill('nonexistent')
      await page.waitForTimeout(500)

      await expect(localSection.locator('.sidebar-header')).toContainText('0/5')
      await expect(remoteSection.locator('.sidebar-header')).toContainText('0/2')
      await expect(page.locator('[data-testid="sidebar-branch-feature/abc"]')).not.toBeVisible()
      await expect(page.locator('[data-testid="sidebar-remote-branch-origin/feature/remote-abc"]')).not.toBeVisible()

      console.log('8. Clicking the clear button...')
      const clearBtn = page.locator('[data-testid="branch-filter-clear-btn"]')
      await expect(clearBtn).toBeVisible()
      await clearBtn.click()
      await page.waitForTimeout(500)

      // Verify input is cleared
      await expect(filterInput).toHaveValue('')

      // Verify all counts and branches are restored
      await expect(localSection.locator('.sidebar-header')).toContainText('5')
      await expect(remoteSection.locator('.sidebar-header')).toContainText('2')
      await expect(clearBtn).not.toBeVisible()

    } finally {
      await app.close()
    }
  })
})
