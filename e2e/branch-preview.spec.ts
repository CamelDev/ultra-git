import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import path from 'path'
import fs from 'fs'

test.describe('Branch Preview - Click loads commits without checkout', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])
    await sandbox.git.addConfig('user.name', 'Test User', false, 'local')
    await sandbox.git.addConfig('user.email', 'test@example.com', false, 'local')

    // Create a second branch with a unique commit
    await sandbox.git.checkoutLocalBranch('feature-branch')
    fs.writeFileSync(path.join(sandbox.dir, 'feature-file.txt'), 'Feature content\n')
    await sandbox.git.add('feature-file.txt')
    await sandbox.git.commit('Commit on feature branch')

    // Switch back to main
    await sandbox.git.checkout('main')

    // Create a mock remote-tracking branch
    await sandbox.git.raw(['update-ref', 'refs/remotes/origin/main', 'HEAD'])
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('should load branch commits on click without checking out, and checkout via button', async () => {
    console.log('1. Launching Electron App...')
    const { app, page } = await launchElectronApp()
    page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.text()))

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

      console.log('6. Verifying active branch is main...')
      const activeBranch = page.locator('[data-testid="sidebar-active-branch"]')
      await expect(activeBranch).toContainText('main')

      console.log('7. Verifying feature-branch is visible in sidebar...')
      const featureBranchItem = page.locator('[data-testid="sidebar-branch-feature-branch"]')
      await expect(featureBranchItem).toBeVisible()

      console.log('8. Clicking on feature-branch to load its commits (should NOT checkout)...')
      await featureBranchItem.click()
      await page.waitForTimeout(1000)

      console.log('9. Verifying active branch is still main (no checkout happened)...')
      await expect(activeBranch).toContainText('main')

      console.log('10. Verifying Git repository HEAD is still on main...')
      let currentBranch = await sandbox.git.revparse(['--abbrev-ref', 'HEAD'])
      expect(currentBranch.trim()).toBe('main')

      console.log('11. Verifying branch preview banner is visible...')
      const previewBanner = page.locator('[data-testid="branch-preview-banner"]')
      await expect(previewBanner).toBeVisible()
      await expect(previewBanner).toContainText('feature-branch')

      console.log('12. Verifying the feature-branch commit message is visible in the graph...')
      const commitMessage = page.locator('.commit-message', { hasText: 'Commit on feature branch' })
      await expect(commitMessage.first()).toBeVisible()

      console.log('13. Hovering on feature-branch and checking it out while preview is active...')
      await featureBranchItem.hover()
      const checkoutBtn = page.locator('[data-testid="checkout-branch-btn-feature-branch"]')
      await expect(checkoutBtn).toBeVisible()
      await checkoutBtn.click()
      await page.waitForTimeout(1000)

      console.log('14. Verifying preview banner is automatically dismissed...')
      await expect(previewBanner).not.toBeVisible()

      console.log('15. Verifying active branch is now feature-branch...')
      await expect(activeBranch).toContainText('feature-branch')

      console.log('16. Verifying Git repository HEAD is now feature-branch...')
      currentBranch = await sandbox.git.revparse(['--abbrev-ref', 'HEAD'])
      expect(currentBranch.trim()).toBe('feature-branch')

      console.log('Branch preview E2E test completed successfully.')
    } finally {
      await app.close()
    }
  })

  test('should automatically clear branch preview if the previewed branch is deleted', async () => {
    console.log('1. Launching Electron App for delete test...')
    const { app, page } = await launchElectronApp()
    page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.text()))

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

      console.log('6. Clicking on feature-branch to load its commits (preview)...')
      const featureBranchItem = page.locator('[data-testid="sidebar-branch-feature-branch"]')
      await expect(featureBranchItem).toBeVisible()
      await featureBranchItem.click()
      await page.waitForTimeout(1000)

      console.log('7. Verifying branch preview banner is visible...')
      const previewBanner = page.locator('[data-testid="branch-preview-banner"]')
      await expect(previewBanner).toBeVisible()
      await expect(previewBanner).toContainText('feature-branch')

      console.log('8. Hovering on feature-branch and clicking delete branch button...')
      await featureBranchItem.hover()
      const deleteBtn = page.locator('[data-testid="delete-branch-btn-feature-branch"]')
      await expect(deleteBtn).toBeVisible()
      await deleteBtn.click()

      console.log('9. Verifying delete branches modal is visible...')
      const deleteModal = page.locator('[data-testid="delete-branches-modal"]')
      await expect(deleteModal).toBeVisible()

      console.log('10. Checking force delete checkbox and clicking confirm delete button...')
      const forceDeleteCheckbox = page.locator('[data-testid="force-delete-branches-checkbox"]')
      await expect(forceDeleteCheckbox).toBeVisible()
      await forceDeleteCheckbox.check()

      const confirmDeleteBtn = page.locator('[data-testid="confirm-delete-branches-btn"]')
      await expect(confirmDeleteBtn).toBeVisible()
      await confirmDeleteBtn.click()
      await page.waitForTimeout(1500)

      console.log('11. Verifying preview banner is automatically dismissed...')
      await expect(previewBanner).not.toBeVisible()

      console.log('12. Verifying feature-branch is no longer visible in sidebar...')
      await expect(featureBranchItem).not.toBeVisible()

      console.log('Branch preview deletion E2E test completed successfully.')
    } finally {
      await app.close()
    }
  })
})