import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'

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

      console.log('19. Mocking git:pushTags and dialog:showMessageBox to confirm push...')
      await app.evaluate(async ({ ipcMain }) => {
        ipcMain.removeHandler('git:pushTags')
        ipcMain.handle('git:pushTags', async () => {
          return { success: true }
        })
      })

      await app.evaluate(async ({ ipcMain }) => {
        ipcMain.removeHandler('dialog:showMessageBox')
        ipcMain.handle('dialog:showMessageBox', async () => {
          return { success: true, response: 1 } // Clicks the 'Push Tags' button (index 1)
        })
      })

      console.log('20. Verifying push tags button in sidebar header and clicking it...')
      const pushTagsBtn = page.locator('[data-testid="sidebar-push-tags-btn"]')
      await expect(pushTagsBtn).toBeVisible()
      await pushTagsBtn.click()
      await page.waitForTimeout(500)

      console.log('Tag creation and push E2E tests verified successfully.')

    } finally {
      await app.close()
    }
  })
})
