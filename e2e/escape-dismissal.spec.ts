import { test, expect } from '@playwright/test'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'

test.describe('Escape Key Dismissal for Modals, Dropdowns, and Overlays', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])
    await sandbox.git.addConfig('user.name', 'Test User', false, 'local')
    await sandbox.git.addConfig('user.email', 'test@example.com', false, 'local')

    await sandbox.createCommit('file1.txt', 'Initial line 1\nInitial line 2', 'First commit')
    await sandbox.createCommit('file2.txt', 'Second file content', 'Second commit')
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('should close TitleBar dropdowns and Tab Settings on Escape', async () => {
    const { app, page } = await launchElectronApp()

    try {
      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => ({ canceled: false, path: repoPath }))
      }, sandbox.dir)

      await addRepoViaUI(page)
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(500)

      // 1. Settings dropdown closes on Escape
      const settingsCog = page.locator('[data-testid="settings-cog-btn"]')
      await settingsCog.click()
      const aboutBtn = page.locator('[data-testid="about-btn"]')
      await expect(aboutBtn).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(aboutBtn).toBeHidden()

      // 2. Add repo dropdown closes on Escape
      const addRepoBtn = page.locator('[data-testid="add-repo-btn"]')
      await addRepoBtn.click()
      const recentRepos = page.locator('[data-testid="recent-repos-dropdown"]')
      await expect(recentRepos).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(recentRepos).toBeHidden()

      // 3. Tab settings popover closes on Escape even when input is blurred
      const tabOptionsBtn = page.locator('[data-testid="set-tab-settings-btn"]').last()
      await tabOptionsBtn.click()
      const tabSettingsPopover = page.locator('[data-testid="tab-settings-popover"]')
      await expect(tabSettingsPopover).toBeVisible()

      // Click a color swatch to blur the text input
      const colorSwatch = page.locator('[data-testid="color-swatch-#ef4444"]')
      if (await colorSwatch.isVisible()) {
        await colorSwatch.click()
      }

      await page.keyboard.press('Escape')
      await expect(tabSettingsPopover).toBeHidden()
    } finally {
      await app.close()
    }
  })

  test('should close GraphView dropdowns and commit modals on Escape', async () => {
    const { app, page } = await launchElectronApp()

    try {
      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => ({ canceled: false, path: repoPath }))
      }, sandbox.dir)

      await addRepoViaUI(page)
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // 1. Pull dropdown closes on Escape
      const pullDropdownBtn = page.locator('[data-testid="pull-dropdown-btn"]')
      await pullDropdownBtn.click()
      const pullMenu = page.locator('[data-testid="pull-dropdown-menu"]')
      await expect(pullMenu).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(pullMenu).toBeHidden()

      // 2. Push dropdown closes on Escape
      const pushDropdownBtn = page.locator('[data-testid="push-dropdown-btn"]')
      await pushDropdownBtn.click()
      const pushMenu = page.locator('[data-testid="push-dropdown-menu"]')
      await expect(pushMenu).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(pushMenu).toBeHidden()

      // 3. Set Remote modal closes on Escape
      await pushDropdownBtn.click()
      const setRemoteOption = page.locator('[data-testid="set-remote-option"]')
      await setRemoteOption.click()
      const remoteModalClose = page.locator('[data-testid="close-remote-modal-btn"]')
      await expect(remoteModalClose).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(remoteModalClose).toBeHidden()

      // 4. Set Upstream modal closes on Escape
      await pushDropdownBtn.click()
      const setUpstreamOption = page.locator('[data-testid="set-upstream-option"]')
      await setUpstreamOption.click()
      const upstreamModalClose = page.locator('[data-testid="close-upstream-modal-btn"]')
      await expect(upstreamModalClose).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(upstreamModalClose).toBeHidden()

      // Commit row setup for commit modals
      const commitLog = await sandbox.git.log()
      const firstCommit = commitLog.all.find(c => c.message === 'First commit')
      const secondCommit = commitLog.all.find(c => c.message === 'Second commit')
      expect(firstCommit).toBeDefined()
      expect(secondCommit).toBeDefined()

      const secondCommitRow = page.locator('.commit-item', { hasText: 'Second commit' })
      await expect(secondCommitRow).toBeVisible()

      // 5. Commit Branch creation modal closes on Escape
      await secondCommitRow.hover()
      const branchBtn = secondCommitRow.locator(`[data-testid="commit-branch-btn-${secondCommit!.hash}"]`)
      await expect(branchBtn).toBeVisible()
      await branchBtn.click()
      const branchModalClose = page.locator('[data-testid="close-branch-modal-btn"]')
      await expect(branchModalClose).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(branchModalClose).toBeHidden()

      // 6. Commit Reset modal closes on Escape (available on non-HEAD commit)
      const firstCommitRow = page.locator('.commit-item', { hasText: 'First commit' })
      await expect(firstCommitRow).toBeVisible()
      await firstCommitRow.hover()
      const resetBtn = firstCommitRow.locator(`[data-testid="commit-reset-btn-${firstCommit!.hash}"]`)
      await expect(resetBtn).toBeVisible()
      await resetBtn.click()
      const resetModalClose = page.locator('[data-testid="close-reset-modal-btn"]')
      await expect(resetModalClose).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(resetModalClose).toBeHidden()

      // 7. Commit Squash modal closes on Escape (available on non-HEAD commit)
      await firstCommitRow.hover()
      const squashBtn = firstCommitRow.locator(`[data-testid="commit-squash-btn-${firstCommit!.hash}"]`)
      await expect(squashBtn).toBeVisible()
      await squashBtn.click()
      const squashModalClose = page.locator('[data-testid="close-squash-modal-btn"]')
      await expect(squashModalClose).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(squashModalClose).toBeHidden()
    } finally {
      await app.close()
    }
  })

  test('should dismiss Conflict Resolver overlay on Escape', async () => {
    // Setup merge conflict branches
    await sandbox.createBranch('branch-a')
    await sandbox.createCommit('file1.txt', 'Line 1\nBranch A change\nLine 3', 'Branch A change')

    await sandbox.checkoutBranch('main')
    await sandbox.createBranch('branch-b')
    await sandbox.createCommit('file1.txt', 'Line 1\nBranch B change\nLine 3', 'Branch B change')

    const { app, page } = await launchElectronApp()

    try {
      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => ({ canceled: false, path: repoPath }))
      }, sandbox.dir)

      await addRepoViaUI(page)
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // Merge branch-a into branch-b to trigger conflict
      const branchAItem = page.locator('[data-testid="sidebar-branch-branch-a"]')
      await expect(branchAItem).toBeVisible()
      await branchAItem.hover()

      const mergeBtn = page.locator('[data-testid="merge-branch-btn-branch-a"]')
      await mergeBtn.dispatchEvent('click')

      const mergeModal = page.locator('.diff-modal-overlay')
      await expect(mergeModal).toBeVisible()

      const confirmMergeBtn = mergeModal.locator('[data-testid="confirm-merge-btn"]')
      await confirmMergeBtn.click()

      // Conflict resolver modal should be auto-opened
      const resolver = page.locator('[data-testid="conflict-resolver"]')
      await expect(resolver).toBeVisible()

      // Press Escape to dismiss (minimize) the conflict resolver overlay
      await page.keyboard.press('Escape')
      await expect(resolver).toBeHidden()

      // Conflict banner should remain visible
      const conflictBanner = page.locator('[data-testid="pull-conflict-banner"]')
      await expect(conflictBanner).toBeVisible()
    } finally {
      await app.close()
    }
  })
})
