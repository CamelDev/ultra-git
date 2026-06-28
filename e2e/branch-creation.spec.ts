import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import path from 'path'
import fs from 'fs'

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
      const remoteSection = page.locator('.sidebar-section:has-text("Remote")')
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

      console.log('25. Rename active branch (feature-from-sidebar -> renamed-active)...')
      await activeBranch.hover()
      const renameActiveBtn = page.locator('[data-testid="sidebar-rename-branch-btn"]')
      await expect(renameActiveBtn).toBeVisible()
      await renameActiveBtn.click()
      await page.waitForTimeout(300)
      
      await expect(modal).toBeVisible()
      await expect(modal).toContainText('Rename Branch')
      await input.fill('renamed-active')
      await submitBtn.click()
      await page.waitForTimeout(1000)
      
      await expect(modal).not.toBeVisible()
      await expect(activeBranch).toContainText('renamed-active')
      
      console.log('26. Verify Git branch renamed for active branch...')
      currentBranch = await sandbox.git.revparse(['--abbrev-ref', 'HEAD'])
      expect(currentBranch.trim()).toBe('renamed-active')

      console.log('27. Rename inactive branch (main -> main-renamed)...')
      await mainBranchItem.hover()
      const renameInactiveBtn = page.locator('[data-testid="rename-branch-btn-main"]')
      await expect(renameInactiveBtn).toBeVisible()
      await renameInactiveBtn.click()
      await page.waitForTimeout(300)
      
      await expect(modal).toBeVisible()
      await input.fill('main-renamed')
      await submitBtn.click()
      await page.waitForTimeout(1000)
      
      await expect(modal).not.toBeVisible()
      const renamedMainBranchItem = page.locator('[data-testid="sidebar-branch-main-renamed"]')
      await expect(renamedMainBranchItem).toBeVisible()

      console.log('28. Verify active branch cannot be deleted...')
      const activeDeleteBtn = page.locator('[data-testid="sidebar-delete-branch-btn"]')
      await expect(activeDeleteBtn).toBeDisabled()

      console.log('29. Delete inactive branch main-renamed...')
      console.log('Mocking dialog:showMessageBox to Confirm (1)...')
      await app.evaluate(async ({ ipcMain }) => {
        ipcMain.removeHandler('dialog:showMessageBox')
        ipcMain.handle('dialog:showMessageBox', async () => {
          return { success: true, response: 1 }
        })
      })
      
      await renamedMainBranchItem.hover()
      const deleteInactiveBtn = page.locator('[data-testid="delete-branch-btn-main-renamed"]')
      await expect(deleteInactiveBtn).toBeVisible()
      await deleteInactiveBtn.click()
      await page.waitForTimeout(1000)

      await expect(renamedMainBranchItem).not.toBeVisible()
      console.log('Branch rename and deletion E2E tests verified successfully.')

    } finally {
      await app.close()
    }
  })

  test('should display local and remote branches sorted alphabetically', async () => {
    console.log('1. Creating additional local and remote branches out of order...')
    // Create local branches: z-local, a-local, m-local (main is already there)
    await sandbox.git.raw(['branch', 'z-local'])
    await sandbox.git.raw(['branch', 'a-local'])
    await sandbox.git.raw(['branch', 'm-local'])
    
    // Create remote tracking branches out of order: origin/z-remote, origin/a-remote, origin/m-remote (origin/main is already there)
    await sandbox.git.raw(['update-ref', 'refs/remotes/origin/z-remote', 'HEAD'])
    await sandbox.git.raw(['update-ref', 'refs/remotes/origin/a-remote', 'HEAD'])
    await sandbox.git.raw(['update-ref', 'refs/remotes/origin/m-remote', 'HEAD'])

    console.log('2. Launching Electron App...')
    const { app, page } = await launchElectronApp()

    try {
      console.log('3. Clearing localStorage...')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      console.log('4. Mocking dialog:openDirectory...')
      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, sandbox.dir)

      console.log('5. Clicking to add repository...')
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()

      console.log('6. Switching to the newly added repository tab...')
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // Expected local branches (alphabetical order): a-local, m-local, main, z-local
      const localSection = page.locator('.sidebar-section').first()
      const branchItems = localSection.locator('.sidebar-item')
      
      console.log('7. Verifying local branches order in the sidebar...')
      await expect(branchItems).toHaveCount(4)
      await expect(branchItems.nth(0)).toContainText('a-local')
      await expect(branchItems.nth(1)).toContainText('m-local')
      await expect(branchItems.nth(2)).toContainText('main')
      await expect(branchItems.nth(3)).toContainText('z-local')

      // Expected remote branches (alphabetical order): origin/a-remote, origin/m-remote, origin/main, origin/z-remote
      const remoteSection = page.locator('.sidebar-section:has-text("Remote")')
      const remoteItems = remoteSection.locator('.sidebar-item')
      
      console.log('8. Verifying remote branches order in the sidebar...')
      await expect(remoteItems).toHaveCount(4)
      await expect(remoteItems.nth(0)).toContainText('origin/a-remote')
      await expect(remoteItems.nth(1)).toContainText('origin/m-remote')
      await expect(remoteItems.nth(2)).toContainText('origin/main')
      await expect(remoteItems.nth(3)).toContainText('origin/z-remote')
      
    } finally {
      await app.close()
    }
  })

  test('should support force deleting an unmerged branch', async () => {
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

      // Create an unmerged branch and add a commit to it
      console.log('6. Creating and committing to unmerged-branch...');
      await sandbox.git.checkoutLocalBranch('unmerged-branch')
      fs.writeFileSync(path.join(sandbox.dir, 'unmerged-file.txt'), 'Not merged content\n')
      await sandbox.git.add('unmerged-file.txt')
      await sandbox.git.commit('Commit on unmerged branch')

      // Switch back to main branch
      console.log('7. Switching back to main branch...');
      await sandbox.git.checkout('main')

      // Refresh app to ensure new branch list is loaded
      await tabs.first().click()
      await page.waitForTimeout(500)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      console.log('8. Verifying unmerged-branch exists in sidebar...');
      const unmergedBranchItem = page.locator('[data-testid="sidebar-branch-unmerged-branch"]')
      await expect(unmergedBranchItem).toBeVisible()

      // Track dialog prompts
      console.log('9. Mocking dialog:showMessageBox to always confirm (Delete and Force Delete)...')
      await app.evaluate(async ({ ipcMain }) => {
        let callCount = 0
        ipcMain.removeHandler('dialog:showMessageBox')
        ipcMain.handle('dialog:showMessageBox', async (_, options) => {
          callCount++
          console.log(`[MAIN] showMessageBox prompt #${callCount} options:`, JSON.stringify(options))
          return { success: true, response: 1 } // Confirm Delete (1) / Confirm Force Delete (1)
        })
      })

      console.log('10. Triggering delete on unmerged-branch...');
      await unmergedBranchItem.hover()
      const deleteBtn = page.locator('[data-testid="delete-branch-btn-unmerged-branch"]')
      await expect(deleteBtn).toBeVisible()
      await deleteBtn.click()
      await page.waitForTimeout(1500)

      console.log('11. Verifying branch is deleted from UI...');
      await expect(unmergedBranchItem).not.toBeVisible()

      console.log('12. Verifying branch is deleted from Git repository on disk...');
      const branches = await sandbox.git.branchLocal()
      expect(branches.all).not.toContain('unmerged-branch')

      console.log('Force delete branch E2E test finished successfully.')

    } finally {
      await app.close()
    }
  })
})
