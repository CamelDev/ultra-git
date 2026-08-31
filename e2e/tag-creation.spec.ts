import { test, expect } from '@playwright/test'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import path from 'path'
import fs from 'fs'

test.describe('Tag Creation from Latest Local Commit', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])
    await sandbox.git.addConfig('user.name', 'Test User', false, 'local')
    await sandbox.git.addConfig('user.email', 'test@example.com', false, 'local')
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('should create a new tag, cancel tag creation, handle errors, and render it in the sidebar list', async () => {
    test.setTimeout(120000)
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
      await addRepoViaUI(page)

      console.log('5. Switching to the newly added repository tab...')
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      console.log('6. Verifying no-tags placeholder is shown initially...')
      const noTagsMsg = page.locator('[data-testid="no-tags-message"]')
      await expect(noTagsMsg).toBeVisible()
      await expect(noTagsMsg).toContainText('No tags')

      console.log('7. Verifying create tag button is visible in toolbar...')
      const createTagBtn = page.locator('[data-testid="create-tag-btn"]')
      await expect(createTagBtn).toBeVisible()

      console.log('8. Clicking create tag button...')
      await createTagBtn.click()
      await page.waitForTimeout(300)

      console.log('9. Verifying tag modal is visible...')
      const modal = page.locator('.diff-modal-content')
      await expect(modal).toBeVisible()
      await expect(modal).toContainText('Create New Tag')

      console.log('10. Testing modal dismissal using Cancel...')
      const cancelBtn = page.locator('[data-testid="cancel-tag-btn"]')
      await cancelBtn.click()
      await page.waitForTimeout(300)
      await expect(modal).not.toBeVisible()

      console.log('10.1. Testing modal dismissal using Escape key...')
      await createTagBtn.click()
      await page.waitForTimeout(300)
      await expect(modal).toBeVisible()
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      await expect(modal).not.toBeVisible()

      console.log('11. Re-opening modal...')
      await createTagBtn.click()
      await page.waitForTimeout(300)

      console.log('12. Entering a tag name...')
      const input = page.locator('[data-testid="new-tag-name-input"]')
      await expect(input).toBeFocused()
      await input.fill('v1.0.0')

      const submitBtn = page.locator('[data-testid="create-tag-submit-btn"]')
      await expect(submitBtn).toBeEnabled()
      await submitBtn.click()
      await page.waitForTimeout(1000)

      console.log('13. Verifying modal is closed...')
      await expect(modal).not.toBeVisible()

      console.log('14. Verifying tag v1.0.0 is listed in the sidebar...')
      const tagItem = page.locator('[data-testid="sidebar-tag-v1.0.0"]')
      await expect(tagItem).toBeVisible()
      await expect(tagItem).toContainText('v1.0.0')

      console.log('14.1. Verifying tag v1.0.0 is shown as a badge in the commits list...')
      const tagBadge = page.locator('[data-testid^="commit-tag-badge-"]').filter({ hasText: 'v1.0.0' })
      await expect(tagBadge).toBeVisible()
      await expect(tagBadge).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

      console.log('14.2. Verifying that the dot icon is replaced by the tag badge...')
      const parentArea = tagBadge.locator('..')
      await expect(parentArea.locator('[data-testid="commit-pushed-circle"]')).not.toBeVisible()

      console.log('15. Verify Tag exists in local Git sandbox repository refs...')
      const tagsList = await sandbox.git.tags()
      expect(tagsList.all).toContain('v1.0.0')

      console.log('16. Attempting to create duplicate tag v1.0.0...')
      await createTagBtn.click()
      await page.waitForTimeout(300)
      await input.fill('v1.0.0')
      await submitBtn.click()
      await page.waitForTimeout(500)

      console.log('17. Verifying error message is displayed for duplicate tag...')
      const errorMsg = page.locator('[data-testid="tag-error-message"]')
      await expect(errorMsg).toBeVisible()
      await expect(errorMsg).toContainText("already exists")

      console.log('18. Dismissing duplicate tag modal...')
      await cancelBtn.click()
      await page.waitForTimeout(300)
      await expect(modal).not.toBeVisible()

      console.log('19. Mocking git:pushTags (the in-app confirm dialog no longer goes through dialog:showMessageBox)...')
      await app.evaluate(async ({ ipcMain }) => {
        ipcMain.removeHandler('git:pushTags')
        ipcMain.handle('git:pushTags', async () => {
          return { success: true }
        })
      })

      console.log('20. Verifying push tags button in sidebar header and clicking it...')
      const pushTagsBtn = page.locator('[data-testid="sidebar-push-tags-btn"]')
      await expect(pushTagsBtn).toBeVisible()
      await pushTagsBtn.click()
      await page.waitForTimeout(300)

      console.log('20.1. Verifying in-app "Push Tags" confirmation dialog is visible (replaces native confirm)...')
      const pushTagsConfirmDialog = page.locator('[data-testid="push-tags-confirm-dialog"]')
      await expect(pushTagsConfirmDialog).toBeVisible()
      await expect(pushTagsConfirmDialog).toContainText('Are you sure you want to push all local tags')
      await expect(pushTagsConfirmDialog).toContainText('Push Tags')

      console.log('20.2. Clicking the in-app "Push Tags" confirm action...')
      const pushTagsConfirmBtn = page.locator('[data-testid="push-tags-confirm-dialog-action-confirm"]')
      await expect(pushTagsConfirmBtn).toBeVisible()
      await pushTagsConfirmBtn.click()
      await page.waitForTimeout(500)

      console.log('20.3. Verifying success toast notification is visible...')
      const successToast = page.locator('[data-testid="toast"][data-variant="success"]')
      await expect(successToast).toBeVisible()
      await expect(successToast).toContainText('All local tags have been successfully pushed')
      await expect(successToast).toContainText('Tags Pushed')

      console.log('20.4. Dismissing the success toast...')
      const toastCloseBtn = successToast.locator('[data-testid="toast-close"]')
      await expect(toastCloseBtn).toBeVisible()
      await toastCloseBtn.click()
      await page.waitForTimeout(500)
      await expect(successToast).not.toBeVisible()

      console.log('21. Hovering and clicking delete button on tag...')
      const tagItemHover = page.locator('[data-testid="sidebar-tag-v1.0.0"]')
      const deleteTagBtn = page.locator('[data-testid="delete-tag-btn-v1.0.0"]')
      await deleteTagBtn.dispatchEvent('click')

      console.log('22. Confirming tag deletion in custom in-app dialog...')
      const confirmDeleteBtn = page.locator('[data-testid="delete-tag-confirm-dialog-action-confirm"]')
      await expect(confirmDeleteBtn).toBeVisible()
      await confirmDeleteBtn.click()
      await page.waitForTimeout(1000)

      console.log('23. Verifying tag v1.0.0 is removed from the sidebar...')
      await expect(tagItemHover).not.toBeVisible()

      console.log('24. Verify Tag is deleted from local Git sandbox repository refs...')
      const updatedTagsList = await sandbox.git.tags()
      expect(updatedTagsList.all).not.toContain('v1.0.0')

      console.log('Tag creation, push, and deletion E2E tests verified successfully.')

    } finally {
      await app.close()
    }
  })

  test('should display local tags sorted from latest to oldest', async () => {
    // 1. Create three tags sequentially at commits with explicit dates to establish distinct creation dates
    console.log('[Tag Sort Test] 1. Initializing tags (v1.0.0, v1.0.1, v1.0.2)...')
    
    // Amend initial commit to 12:00:00
    await sandbox.git.env({ GIT_COMMITTER_DATE: '2026-06-28T12:00:00' })
      .raw(['commit', '--amend', '--date', '2026-06-28 12:00:00', '--no-edit'])
    await sandbox.git.addTag('v1.0.0')
    
    // Commit 1 at 12:05:00
    fs.writeFileSync(path.join(sandbox.dir, 'file1.txt'), 'content 1')
    await sandbox.git.add('file1.txt')
    await sandbox.git.env({ GIT_COMMITTER_DATE: '2026-06-28T12:05:00' })
      .raw(['commit', '--date', '2026-06-28 12:05:00', '-m', 'commit 1'])
    await sandbox.git.addTag('v1.0.1')
    
    // Commit 2 at 12:10:00
    fs.writeFileSync(path.join(sandbox.dir, 'file2.txt'), 'content 2')
    await sandbox.git.add('file2.txt')
    await sandbox.git.env({ GIT_COMMITTER_DATE: '2026-06-28T12:10:00' })
      .raw(['commit', '--date', '2026-06-28 12:10:00', '-m', 'commit 2'])
    await sandbox.git.addTag('v1.0.2')

    console.log('[Tag Sort Test] 2. Launching Electron App...')
    const { app, page } = await launchElectronApp()

    try {
      console.log('[Tag Sort Test] 3. Clearing localStorage...')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      console.log('[Tag Sort Test] 4. Mocking dialog:openDirectory...')
      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, sandbox.dir)

      console.log('[Tag Sort Test] 5. Clicking to add repository...')
      await addRepoViaUI(page)

      console.log('[Tag Sort Test] 6. Switching to sandbox repository tab...')
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      console.log('[Tag Sort Test] 7. Verifying tag order (latest to oldest)...')
      const tagsSection = page.locator('.sidebar-section:has-text("Tags")')
      await expect(tagsSection).toBeVisible()

      const tagItems = tagsSection.locator('.sidebar-item')
      await expect(tagItems).toHaveCount(3)

      // Expected order: v1.0.2, v1.0.1, v1.0.0
      await expect(tagItems.nth(0)).toContainText('v1.0.2')
      await expect(tagItems.nth(1)).toContainText('v1.0.1')
      await expect(tagItems.nth(2)).toContainText('v1.0.0')

      console.log('[Tag Sort Test] Tag sorting E2E verified successfully.')
    } finally {
      await app.close()
    }
  })

  test('should allow collapsing the tags list and persist the collapsed state', async () => {
    // 1. Create a tag v1.0.0
    await sandbox.git.addTag('v1.0.0')

    console.log('[Tag Collapse Test] Launching Electron App...')
    const { app, page } = await launchElectronApp()

    try {
      console.log('[Tag Collapse Test] Clearing localStorage...')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      console.log('[Tag Collapse Test] Mocking dialog:openDirectory...')
      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, sandbox.dir)

      console.log('[Tag Collapse Test] Clicking to add repository...')
      await addRepoViaUI(page)

      console.log('[Tag Collapse Test] Switching to sandbox repository tab...')
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // Verify tag is initially visible (expanded)
      const tagItem = page.locator('[data-testid="sidebar-tag-v1.0.0"]')
      await expect(tagItem).toBeVisible()

      // Click header to collapse
      const header = page.locator('[data-testid="sidebar-tags-header"]')
      await expect(header).toBeVisible()
      await header.click()
      await page.waitForTimeout(500)

      // Verify tag is no longer visible
      await expect(tagItem).not.toBeVisible()

      // Reload page and check persistence
      console.log('[Tag Collapse Test] Reloading to verify persistence...')
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Tag should still be collapsed/invisible
      await expect(page.locator('[data-testid="sidebar-tag-v1.0.0"]')).not.toBeVisible()

      // Click header to expand again
      const headerAfterReload = page.locator('[data-testid="sidebar-tags-header"]')
      await headerAfterReload.click()
      await page.waitForTimeout(500)

      // Tag should be visible again
      await expect(page.locator('[data-testid="sidebar-tag-v1.0.0"]')).toBeVisible()

      console.log('[Tag Collapse Test] Tag collapse and persistence E2E verified successfully.')
    } finally {
      await app.close()
    }
  })

  test('should allow creating a tag on a specific commit via commit actions and display target commit info', async () => {
    fs.writeFileSync(path.join(sandbox.dir, 'commit1.txt'), 'commit 1')
    await sandbox.git.add('commit1.txt')
    await sandbox.git.commit('First custom commit')

    fs.writeFileSync(path.join(sandbox.dir, 'commit2.txt'), 'commit 2')
    await sandbox.git.add('commit2.txt')
    await sandbox.git.commit('Second custom commit')

    const log = await sandbox.git.log()
    const targetCommit = log.all.find((c) => c.message.includes('First custom commit'))!
    expect(targetCommit).toBeDefined()

    console.log('[Commit Tag Test] Launching Electron App...')
    const { app, page } = await launchElectronApp()

    try {
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, sandbox.dir)

      await addRepoViaUI(page)

      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      console.log('[Commit Tag Test] Waiting for commit list...')
      const commitList = page.locator('.commit-list')
      await expect(commitList).toBeVisible()

      console.log(`[Commit Tag Test] Selecting commit row for ${targetCommit.hash}...`)
      const commitRow = commitList.locator('.commit-item', { hasText: 'First custom commit' })
      await expect(commitRow).toBeVisible()
      await commitRow.click()
      await commitRow.hover()
      await page.waitForTimeout(300)

      const commitTagBtn = commitRow.locator('[data-testid^="commit-tag-btn-"]')
      await commitTagBtn.dispatchEvent('click')
      await page.waitForTimeout(300)

      console.log('[Commit Tag Test] Verifying target commit info is displayed in tag dialog...')
      const targetCommitInfo = page.locator('[data-testid="tag-target-commit-info"]')
      await expect(targetCommitInfo).toBeVisible()
      await expect(targetCommitInfo).toContainText(targetCommit.hash.substring(0, 8))
      await expect(targetCommitInfo).toContainText('First custom commit')

      const input = page.locator('[data-testid="new-tag-name-input"]')
      await input.fill('v2.0.0')

      const submitBtn = page.locator('[data-testid="create-tag-submit-btn"]')
      await submitBtn.click()
      await page.waitForTimeout(1000)

      console.log('[Commit Tag Test] Verifying tag v2.0.0 exists in Git sandbox...')
      const tags = await sandbox.git.tags()
      expect(tags.all).toContain('v2.0.0')

      console.log('[Commit Tag Test] Verified creating tag on specific commit successfully.')
    } finally {
      await app.close()
    }
  })

  test('should hide reset and squash buttons during branch preview, but allow tagging', async () => {
    fs.writeFileSync(path.join(sandbox.dir, 'commit1.txt'), 'base')
    await sandbox.git.add('commit1.txt')
    await sandbox.git.commit('Base commit')

    await sandbox.git.checkoutLocalBranch('feature-branch')
    fs.writeFileSync(path.join(sandbox.dir, 'feature.txt'), 'feature')
    await sandbox.git.add('feature.txt')
    await sandbox.git.commit('Feature commit 1')

    fs.writeFileSync(path.join(sandbox.dir, 'feature2.txt'), 'feature 2')
    await sandbox.git.add('feature2.txt')
    await sandbox.git.commit('Feature commit 2')

    await sandbox.git.checkout('main')

    const log = await sandbox.git.log(['feature-branch'])
    const featureCommit = log.all.find((c) => c.message.includes('Feature commit 1'))!
    expect(featureCommit).toBeDefined()

    console.log('[Branch Preview Actions Test] Launching Electron App...')
    const { app, page } = await launchElectronApp()

    try {
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, sandbox.dir)

      await addRepoViaUI(page)

      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      console.log('[Branch Preview Actions Test] Previewing feature-branch...')
      const branchItem = page.locator('[data-testid="sidebar-branch-feature-branch"]')
      await expect(branchItem).toBeVisible()
      await branchItem.click({ position: { x: 10, y: 10 } })
      await page.waitForTimeout(1000)

      console.log('[Branch Preview Actions Test] Hovering over previewed commit row...')
      const commitRow = page.locator('.commit-item', { hasText: 'Feature commit 1' })
      await expect(commitRow).toBeVisible()
      await commitRow.hover()
      await page.waitForTimeout(300)

      console.log('[Branch Preview Actions Test] Verifying reset and squash buttons are hidden...')
      const resetBtn = commitRow.locator('[data-testid^="commit-reset-btn-"]')
      const squashBtn = commitRow.locator('[data-testid^="commit-squash-btn-"]')
      await expect(resetBtn).not.toBeVisible()
      await expect(squashBtn).not.toBeVisible()

      console.log('[Branch Preview Actions Test] Verifying tag button IS visible...')
      const tagBtn = commitRow.locator('[data-testid^="commit-tag-btn-"]')
      await expect(tagBtn).toBeVisible()

      console.log('[Branch Preview Actions Test] Creating tag on previewed branch commit...')
      await tagBtn.dispatchEvent('click')
      await page.waitForTimeout(300)

      const input = page.locator('[data-testid="new-tag-name-input"]')
      await input.fill('preview-tag-1')

      const submitBtn = page.locator('[data-testid="create-tag-submit-btn"]')
      await submitBtn.click()
      await page.waitForTimeout(1000)

      console.log('[Branch Preview Actions Test] Verifying tag preview-tag-1 in sandbox...')
      const tags = await sandbox.git.tags()
      expect(tags.all).toContain('preview-tag-1')

      console.log('[Branch Preview Actions Test] Verified preview action constraints successfully.')
    } finally {
      await app.close()
    }
  })

  test('should push tags via the Push dropdown menu in the toolbar', async () => {
    // 1. Create a local tag so the repository has tags to push
    await sandbox.git.addTag('v9.9.9')

    console.log('[Push Tags Dropdown Test] 2. Launching Electron App...')
    const { app, page } = await launchElectronApp()

    try {
      console.log('[Push Tags Dropdown Test] 3. Clearing localStorage...')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      console.log('[Push Tags Dropdown Test] 4. Mocking dialog:openDirectory...')
      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, sandbox.dir)

      console.log('[Push Tags Dropdown Test] 5. Clicking to add repository...')
      await addRepoViaUI(page)

      console.log('[Push Tags Dropdown Test] 6. Switching to sandbox repository tab...')
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      console.log('[Push Tags Dropdown Test] 7. Mocking git:pushTags to succeed...')
      await app.evaluate(async ({ ipcMain }) => {
        ipcMain.removeHandler('git:pushTags')
        ipcMain.handle('git:pushTags', async () => {
          return { success: true }
        })
      })

      console.log('[Push Tags Dropdown Test] 8. Opening the Push dropdown menu...')
      const pushDropdownBtn = page.locator('[data-testid="push-dropdown-btn"]')
      await expect(pushDropdownBtn).toBeVisible()
      await pushDropdownBtn.click()
      await page.waitForTimeout(300)

      console.log('[Push Tags Dropdown Test] 9. Verifying the "Push Tags" menu item is listed...')
      const pushDropdownMenu = page.locator('[data-testid="push-dropdown-menu"]')
      await expect(pushDropdownMenu).toBeVisible()
      const pushTagsOption = page.locator('[data-testid="push-tags-option"]')
      await expect(pushTagsOption).toBeVisible()
      await expect(pushTagsOption).toContainText('Push Tags')

      console.log('[Push Tags Dropdown Test] 10. Clicking "Push Tags" menu item...')
      await pushTagsOption.click()
      await page.waitForTimeout(300)

      console.log('[Push Tags Dropdown Test] 11. Verifying dropdown closed and confirmation dialog is visible...')
      await expect(pushDropdownMenu).not.toBeVisible()
      const pushTagsConfirmDialog = page.locator('[data-testid="push-tags-confirm-dialog"]')
      await expect(pushTagsConfirmDialog).toBeVisible()
      await expect(pushTagsConfirmDialog).toContainText('Are you sure you want to push all local tags')

      console.log('[Push Tags Dropdown Test] 12. Cancelling the confirmation dialog...')
      const cancelBtn = page.locator('[data-testid="push-tags-confirm-dialog-action-cancel"]')
      await expect(cancelBtn).toBeVisible()
      await cancelBtn.click()
      await page.waitForTimeout(300)
      await expect(pushTagsConfirmDialog).not.toBeVisible()

      console.log('[Push Tags Dropdown Test] 13. Re-opening the dropdown and confirming the push...')
      await pushDropdownBtn.click()
      await page.waitForTimeout(300)
      await page.locator('[data-testid="push-tags-option"]').click()
      await page.waitForTimeout(300)
      const pushTagsConfirmBtn = page.locator('[data-testid="push-tags-confirm-dialog-action-confirm"]')
      await expect(pushTagsConfirmBtn).toBeVisible()
      await pushTagsConfirmBtn.click()
      await page.waitForTimeout(500)

      console.log('[Push Tags Dropdown Test] 14. Verifying success toast notification...')
      const successToast = page.locator('[data-testid="toast"][data-variant="success"]')
      await expect(successToast).toBeVisible()
      await expect(successToast).toContainText('Tags Pushed')
      await expect(successToast).toContainText('All local tags have been successfully pushed')

      console.log('[Push Tags Dropdown Test] Push tags dropdown flow E2E verified successfully.')
    } finally {
      await app.close()
    }
  })
})

