import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'

test.describe('Set Upstream branch on push', () => {
  let localSandbox: GitSandbox
  let remoteSandbox: GitSandbox

  test.beforeEach(async () => {
    // 1. Remote bare repository acting as upstream
    remoteSandbox = new GitSandbox()
    await remoteSandbox.git.init(true)

    // 2. Local repository
    localSandbox = new GitSandbox()
    await localSandbox.init()
    await localSandbox.git.branch(['-M', 'main'])
  })

  test.afterEach(async () => {
    await localSandbox.destroy()
    await remoteSandbox.destroy()
  })

  test('should prefill local branch name as fallback when tracking branch is not set', async () => {
    const { app, page } = await launchElectronApp()

    try {
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Add remote repository to local
      await localSandbox.git.addRemote('origin', remoteSandbox.dir)

      // Load local repository in app
      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, localSandbox.dir)

      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()

      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // Open Push dropdown
      const dropdownToggle = page.locator('[data-testid="push-dropdown-btn"]')
      await expect(dropdownToggle).toBeVisible()
      await dropdownToggle.click()

      // Click Set Upstream option
      const setUpstreamOption = page.locator('[data-testid="set-upstream-option"]')
      await expect(setUpstreamOption).toBeVisible()
      await setUpstreamOption.click()

      // Verify modal opens
      const modal = page.locator('.diff-modal-content')
      await expect(modal).toBeVisible()
      await expect(modal).toContainText('Set Upstream Branch')

      // Verify the input is prefilled with 'main' (the local branch name since no tracking is set)
      const input = page.locator('[data-testid="upstream-branch-input"]')
      await expect(input).toHaveValue('main')

      // Close modal
      const closeBtn = page.locator('[data-testid="close-upstream-modal-btn"]')
      await closeBtn.click()
      await expect(modal).not.toBeVisible()

    } finally {
      await app.close()
    }
  })

  test('should prefill existing tracking branch and update upstream successfully on submission', async () => {
    // Configure tracking branch on local repo beforehand
    await localSandbox.git.addRemote('origin', remoteSandbox.dir)
    await localSandbox.createCommit('sample.txt', 'content', 'First push')
    await localSandbox.git.push('origin', 'main', { '--set-upstream': null })

    const { app, page } = await launchElectronApp()

    try {
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Load local repository in app
      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, localSandbox.dir)

      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()

      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // Add a local commit to push
      await localSandbox.createCommit('sample2.txt', 'more content', 'Second commit')
      await page.waitForTimeout(500)

      // Open Push dropdown
      const dropdownToggle = page.locator('[data-testid="push-dropdown-btn"]')
      await expect(dropdownToggle).toBeVisible()
      await dropdownToggle.click()

      // Click Set Upstream option
      const setUpstreamOption = page.locator('[data-testid="set-upstream-option"]')
      await expect(setUpstreamOption).toBeVisible()
      await setUpstreamOption.click()

      // Verify modal opens
      const modal = page.locator('.diff-modal-content')
      await expect(modal).toBeVisible()

      // Verify prefilled value matches existing tracking branch 'main'
      const input = page.locator('[data-testid="upstream-branch-input"]')
      await expect(input).toHaveValue('main')

      // Fill in new tracking branch name
      await input.fill('custom-upstream-branch')

      // Click submit
      const submitBtn = page.locator('[data-testid="upstream-submit-btn"]')
      await expect(submitBtn).toBeEnabled()
      await submitBtn.click()

      // Modal should disappear on success
      await expect(modal).not.toBeVisible({ timeout: 15000 })

      // Verify that local repository tracking branch has updated to the new one
      const status = await localSandbox.git.status()
      expect(status.tracking).toBe('origin/custom-upstream-branch')

    } finally {
      await app.close()
    }
  })
})
