import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'

test.describe('Branch Creation from Latest Local Commit', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])
    await sandbox.git.addConfig('user.name', 'Test User', false, 'local')
    await sandbox.git.addConfig('user.email', 'test@example.com', false, 'local')
    // Create a mock remote-tracking branch
    await sandbox.git.raw(['update-ref', 'refs/remotes/origin/main', 'HEAD'])
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('should create a new branch, switch to it, show actual remote, list multiple branches, and checkout on click', async () => {
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

      console.log('6. Verifying active branch is main...')
      const activeBranch = page.locator('[data-testid="sidebar-active-branch"]')
      await expect(activeBranch).toContainText('main')

      console.log('6.1. Verifying remote tracking branch is origin/main...')
      const remoteSection = page.locator('.sidebar-section').nth(1)
      await expect(remoteSection).toContainText('origin/main')
      await expect(remoteSection).not.toContainText('origin/feature-cool')

      console.log('7. Verifying create branch button is visible...')
      const createBranchBtn = page.locator('[data-testid="create-branch-btn"]')
      await expect(createBranchBtn).toBeVisible()

      console.log('8. Clicking create branch button...')
      await createBranchBtn.click()
      await page.waitForTimeout(300)

      console.log('9. Verifying branch modal overlay...')
      const modal = page.locator('.diff-modal-content')
      await expect(modal).toBeVisible()
      await expect(modal).toContainText('Create New Branch')

      console.log('10. Testing modal dismissal using Cancel...')
      const cancelBtn = page.locator('[data-testid="cancel-branch-btn"]')
      await cancelBtn.click()
      await page.waitForTimeout(300)
      await expect(modal).not.toBeVisible()

      console.log('11. Re-opening modal...')
      await createBranchBtn.click()
      await page.waitForTimeout(300)

      console.log('12. Entering a duplicate branch name (main) to test duplicate check...')
      const input = page.locator('[data-testid="new-branch-name-input"]')
      await expect(input).toBeFocused()
      await input.fill('main')

      const submitBtn = page.locator('[data-testid="create-branch-submit-btn"]')
      await expect(submitBtn).toBeEnabled()
      await submitBtn.click()
      await page.waitForTimeout(500)

      console.log('13. Verifying error message display...')
      const errorMsg = page.locator('[data-testid="branch-error-message"]')
      await expect(errorMsg).toBeVisible()
      await expect(errorMsg).toContainText("already exists")

      console.log('14. Typing a valid new branch name...')
      await input.fill('feature-cool')
      await submitBtn.click()
      await page.waitForTimeout(1000)

      console.log('15. Verifying modal is closed...')
      await expect(modal).not.toBeVisible()

      console.log('16. Verifying active branch in UI switches to feature-cool...')
      await expect(activeBranch).toContainText('feature-cool')

      console.log('17. Verifying Git repository state via sandbox...')
      let currentBranch = await sandbox.git.revparse(['--abbrev-ref', 'HEAD'])
      expect(currentBranch.trim()).toBe('feature-cool')

      console.log('17.1. Verifying that both main and feature-cool local branches are visible in the sidebar...')
      const mainBranchItem = page.locator('[data-testid="sidebar-branch-main"]')
      await expect(mainBranchItem).toBeVisible()
      await expect(mainBranchItem).toContainText('main')
      await expect(activeBranch).toContainText('feature-cool')

      console.log('17.2. Clicking on main to switch back...')
      await mainBranchItem.click()
      await page.waitForTimeout(1000)

      console.log('17.3. Verifying active branch is back to main...')
      await expect(activeBranch).toContainText('main')
      const featureCoolBranchItem = page.locator('[data-testid="sidebar-branch-feature-cool"]')
      await expect(featureCoolBranchItem).toBeVisible()
      await expect(featureCoolBranchItem).toContainText('feature-cool')

      console.log('17.4. Verifying Git repository HEAD is back to main...')
      currentBranch = await sandbox.git.revparse(['--abbrev-ref', 'HEAD'])
      expect(currentBranch.trim()).toBe('main')

      console.log('18. Verifying sidebar inline create branch button is visible on active branch...')
      const sidebarCreateBranchBtn = page.locator('[data-testid="sidebar-create-branch-btn"]')
      await expect(sidebarCreateBranchBtn).toBeVisible()

      console.log('19. Clicking sidebar inline create branch button...')
      await sidebarCreateBranchBtn.click()
      await page.waitForTimeout(300)

      console.log('20. Verifying modal is opened via sidebar button...')
      await expect(modal).toBeVisible()

      console.log('21. Entering branch name: feature-from-sidebar...')
      await input.fill('feature-from-sidebar')
      await submitBtn.click()
      await page.waitForTimeout(1000)

      console.log('22. Verifying modal is closed...')
      await expect(modal).not.toBeVisible()

      console.log('23. Verifying active branch in UI switches to feature-from-sidebar...')
      await expect(activeBranch).toContainText('feature-from-sidebar')

      console.log('24. Verifying Git repository state via sandbox...')
      currentBranch = await sandbox.git.revparse(['--abbrev-ref', 'HEAD'])
      expect(currentBranch.trim()).toBe('feature-from-sidebar')

      console.log('Branch creation E2E test completed successfully.')

    } finally {
      await app.close()
    }
  })
})
