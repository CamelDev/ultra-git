import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
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

      console.log('20.3. Verifying in-app success dialog is visible (replaces native alert)...')
      const pushTagsAlertDialog = page.locator('[data-testid="push-tags-alert-dialog"]')
      await expect(pushTagsAlertDialog).toBeVisible()
      await expect(pushTagsAlertDialog).toContainText('All local tags have been successfully pushed')
      await expect(pushTagsAlertDialog).toContainText('Tags Pushed')

      // Confirm the dialog uses the new in-app style class (not the OS message box)
      const dialogVariant = await pushTagsAlertDialog.getAttribute('data-variant')
      expect(dialogVariant).toBe('success')

      console.log('20.4. Closing the in-app success dialog via OK button...')
      const pushTagsAlertOk = page.locator('[data-testid="push-tags-alert-dialog-ok"]')
      await expect(pushTagsAlertOk).toBeVisible()
      await pushTagsAlertOk.click()
      await page.waitForTimeout(300)
      await expect(pushTagsAlertDialog).not.toBeVisible()

      console.log('21. Mocking dialog:showMessageBox for deleting tag (still uses native dialog)...')
      await app.evaluate(async ({ ipcMain }) => {
        ipcMain.removeHandler('dialog:showMessageBox')
        ipcMain.handle('dialog:showMessageBox', async () => {
          return { success: true, response: 1, checkboxChecked: false }
        })
      })

      console.log('22. Verifying delete button on tag is visible (hovering first) and clicking it...')
      const tagItemHover = page.locator('[data-testid="sidebar-tag-v1.0.0"]')
      await tagItemHover.hover()
      
      const deleteTagBtn = page.locator('[data-testid="delete-tag-btn-v1.0.0"]')
      await expect(deleteTagBtn).toBeVisible()
      await deleteTagBtn.click()
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
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()

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
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()

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
})
