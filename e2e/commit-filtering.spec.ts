import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'

test.describe('Commit Search Filtering', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])
    
    // Create some distinct commits
    // Commit 1: Initial commit (automatically created by sandbox.init)
    
    // Commit 2: Alice commit
    await sandbox.git.addConfig('user.name', 'Alice Smith', false, 'local')
    await sandbox.git.addConfig('user.email', 'alice@example.com', false, 'local')
    await sandbox.createCommit('file_alice.txt', 'Alice content', 'Alpha feature commit by Alice')
    
    // Commit 3: Bob commit
    await sandbox.git.addConfig('user.name', 'Bob Jones', false, 'local')
    await sandbox.git.addConfig('user.email', 'bob@example.com', false, 'local')
    await sandbox.createCommit('file_bob.txt', 'Bob content', 'Beta layout commit by Bob')
    
    // Commit 4: Charlie commit with a tag
    await sandbox.git.addConfig('user.name', 'Charlie Brown', false, 'local')
    await sandbox.git.addConfig('user.email', 'charlie@example.com', false, 'local')
    await sandbox.createCommit('file_charlie.txt', 'Charlie content', 'Gamma styling commit by Charlie')
    await sandbox.createTag('v1.0.0-gamma')
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('should filter commits dynamically by message, author, hash, tags, and clear correctly', async ({}) => {
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

      console.log('6. Verifying initial commit list has 4 commits...')
      const commitList = page.locator('.commit-list')
      await expect(commitList).toBeVisible()
      const commitItems = commitList.locator('.commit-item')
      await expect(commitItems).toHaveCount(4)

      // Locate search input container and input itself
      const searchContainer = page.locator('[data-testid="commit-search-container"]')
      await expect(searchContainer).toBeVisible()
      const searchInput = page.locator('[data-testid="commit-search-input"]')
      await expect(searchInput).toBeVisible()

      // Test 1: Filter by message
      console.log('7. Filtering by message: "Alpha"...')
      await searchInput.fill('Alpha')
      await page.waitForTimeout(500)
      await expect(commitItems).toHaveCount(1)
      await expect(commitItems.first()).toContainText('Alpha feature commit by Alice')
      await expect(commitItems.first()).toContainText('Alice Smith')

      // Test 2: Filter by author name
      console.log('8. Filtering by author name: "Bob"...')
      await searchInput.fill('Bob')
      await page.waitForTimeout(500)
      await expect(commitItems).toHaveCount(1)
      await expect(commitItems.first()).toContainText('Beta layout commit by Bob')
      await expect(commitItems.first()).toContainText('Bob Jones')

      // Test 3: Filter by author email
      console.log('9. Filtering by author email: "charlie@example.com"...')
      await searchInput.fill('charlie@example.com')
      await page.waitForTimeout(500)
      await expect(commitItems).toHaveCount(1)
      await expect(commitItems.first()).toContainText('Gamma styling commit by Charlie')
      await expect(commitItems.first()).toContainText('Charlie Brown')

      // Test 4: Filter by tag
      console.log('10. Filtering by tag: "v1.0.0-gamma"...')
      await searchInput.fill('v1.0.0-gamma')
      await page.waitForTimeout(500)
      await expect(commitItems).toHaveCount(1)
      await expect(commitItems.first()).toContainText('Gamma styling commit by Charlie')
      // Note: tag badge is rendered
      await expect(page.locator('[data-testid^="commit-tag-badge-"]')).toContainText('v1.0.0-gamma')

      // Test 5: Filter by hash
      console.log('11. Retrieving a hash to filter by...')
      // Let's clear search to get bob's hash
      const clearBtn = page.locator('[data-testid="commit-search-clear-btn"]')
      await expect(clearBtn).toBeVisible()
      await clearBtn.click()
      await page.waitForTimeout(500)
      await expect(commitItems).toHaveCount(4)
      
      // Let's filter by message to isolate Bob's commit and get its hash/text
      await searchInput.fill('Beta layout')
      await page.waitForTimeout(500)
      
      // Find Bob's commit and search on its hash
      // The commits are displayed as list items. Since they don't have hash displayed directly, we can read it from the reset button's test-id: commit-reset-btn-<hash>
      const resetBtn = page.locator('[data-testid^="commit-reset-btn-"]').first()
      const resetTestId = await resetBtn.getAttribute('data-testid')
      const hash = resetTestId ? resetTestId.replace('commit-reset-btn-', '') : ''
      expect(hash.length).toBeGreaterThan(0)
      
      const shortHash = hash.substring(0, 6)
      console.log(`Bob's commit hash: ${hash}, short hash: ${shortHash}`)
      
      // Now clear search, then filter by Bob's short hash
      await clearBtn.click()
      await page.waitForTimeout(500)
      await searchInput.fill(shortHash)
      await page.waitForTimeout(500)
      await expect(commitItems).toHaveCount(1)
      await expect(commitItems.first()).toContainText('Beta layout commit by Bob')

      // Test 6: Clear filter and restore all
      console.log('12. Clearing filter to restore all...')
      await clearBtn.click()
      await page.waitForTimeout(500)
      await expect(commitItems).toHaveCount(4)
      await expect(searchInput).toHaveValue('')

      // Test 7: Enter query with no matches
      console.log('13. Entering query with no matches...')
      await searchInput.fill('NonexistentCommitQueryXYZ')
      await page.waitForTimeout(500)
      await expect(commitItems).toHaveCount(0)
      const noCommitsMsg = page.locator('[data-testid="no-commits-message"]')
      await expect(noCommitsMsg).toBeVisible()
      await expect(noCommitsMsg).toContainText('No commits match search query.')

    } finally {
      await app.close()
    }
  })
})
