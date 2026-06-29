import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'

test.describe('Load More Commits in History', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])
    
    // Create 55 commits to exceed the default limit of 50
    console.log('Creating 55 commits in the git sandbox...')
    for (let i = 1; i <= 55; i++) {
      await sandbox.createCommit(`file${i}.txt`, `Content for commit ${i}`, `Commit message ${i}`)
    }
    console.log('Successfully created 55 commits.')
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('should initially load 50 commits and load all 55 commits on clicking Load More', async () => {
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

      console.log('6. Verifying that exactly 50 commits are loaded initially...')
      const commitList = page.locator('.commit-list')
      await expect(commitList).toBeVisible()
      
      const commitItems = commitList.locator('.commit-item')
      await expect(commitItems).toHaveCount(50)

      console.log('7. Verifying "Load More" button is visible...')
      const loadMoreBtn = page.locator('[data-testid="load-more-btn"]')
      await expect(loadMoreBtn).toBeVisible()
      await expect(loadMoreBtn).toContainText('Load More Commits')

      console.log('8. Clicking "Load More" button...')
      await loadMoreBtn.click()
      await page.waitForTimeout(1500)

      console.log('9. Verifying that all 56 commits are now loaded...')
      await expect(commitItems).toHaveCount(56)

      console.log('10. Verifying "Load More" button is now hidden...')
      await expect(loadMoreBtn).not.toBeVisible()

    } finally {
      await app.close()
    }
  })
})
