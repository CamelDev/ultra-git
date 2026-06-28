import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import path from 'path'
import fs from 'fs'

test.describe('Commit Changed Files and Split Diff Modal', () => {
  let sandbox: GitSandbox

  test.beforeAll(async () => {
    // Initialize a new Git sandbox repository
    sandbox = new GitSandbox()
    await sandbox.init()
    
    // Create second commit adding a small file
    await sandbox.createCommit('sample.txt', 'Line 1\nLine 2\nLine 3\n', 'Add sample.txt')
    
    // Create third commit modifying the small file
    await sandbox.createCommit('sample.txt', 'Line 1\nLine 2 Modified\nLine 3\nLine 4 Added\n', 'Modify sample.txt')

    // Create fourth commit adding a large file (150 lines)
    const largeFileContent = Array.from({ length: 150 }, (_, i) => `Line ${i + 1}`).join('\n') + '\n'
    await sandbox.createCommit('large-sample.txt', largeFileContent, 'Add large-sample.txt')
    
    // Create fifth commit modifying the large file deep in the content
    const modifiedLargeContent = Array.from({ length: 150 }, (_, i) => {
      if (i === 119) return 'Line 120 Modified'
      return `Line ${i + 1}`
    }).join('\n') + '\nLine 151 Added\n'
    await sandbox.createCommit('large-sample.txt', modifiedLargeContent, 'Modify large-sample.txt')
  })

  test.afterAll(async () => {
    await sandbox.destroy()
  })

  test('should display changed files and support standard diff functions', async () => {
    const { app, page } = await launchElectronApp()

    try {
      // Clear localStorage to ensure clean state
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Mock openDirectory dialog to load sandbox repo
      await app.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath }
        })
      }, sandbox.dir)

      // Click to add repository
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()

      // Verify and switch to the sandbox repository tab
      const expectedTabName = path.basename(sandbox.dir)
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await expect(tabs.last()).toContainText(expectedTabName)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      const commitItems = page.locator('.commit-item')
      await expect(commitItems).toHaveCount(5)

      // Verify that the top commit is automatically selected on activation
      await expect(commitItems.first()).toHaveClass(/active/)
      
      const smallModCommit = commitItems.nth(2)
      await expect(smallModCommit).toContainText('Modify sample.txt')

      // Select the commit
      await smallModCommit.click()
      await page.waitForTimeout(500)

      // Verify commit highlight
      await expect(smallModCommit).toHaveClass(/active/)

      // 1. Verify date format in the commit list (should contain a colon ':' indicating hour/minute)
      const firstCommitDate = commitItems.first().locator('.commit-date')
      await expect(firstCommitDate).toBeVisible()
      const dateText = await firstCommitDate.textContent()
      expect(dateText).toContain(':')

      // 2. Verify short SHA is shown in Details Panel
      const shaShort = page.locator('[data-testid="commit-sha-short"]')
      await expect(shaShort).toBeVisible()
      const shaShortText = await shaShort.textContent()
      expect(shaShortText?.trim().length).toBe(7)

      // 3. Verify copy full SHA button behavior
      const copyBtn = page.locator('[data-testid="copy-sha-btn"]')
      await expect(copyBtn).toBeVisible()
      await copyBtn.click()

      // Verify the clipboard contains the full SHA (40 characters) and starts with the short SHA
      const clipboardText = await app.evaluate(async ({ clipboard }) => {
        return clipboard.readText()
      })
      expect(clipboardText.startsWith(shaShortText?.trim() || '')).toBe(true)
      expect(clipboardText.length).toBe(40)

      // Verify details panel files list
      const fileItem = page.locator('.details-panel .file-item').first()
      await expect(fileItem).toBeVisible()
      await expect(fileItem).toContainText('sample.txt')
      
      const statusBadge = fileItem.locator('.file-status')
      await expect(statusBadge).toContainText('M')
      await expect(statusBadge).toHaveClass(/status-m/)

      // Click file to open diff
      await fileItem.click()
      await page.waitForTimeout(500)

      // Verify diff modal is visible
      const diffModalOverlay = page.locator('.diff-modal-overlay')
      await expect(diffModalOverlay).toBeVisible()

      // Verify diff rows
      const deleteRow = page.locator('.diff-row.type-delete')
      await expect(deleteRow).toBeVisible()
      await expect(deleteRow.locator('.diff-col.left .diff-line-content')).toContainText('Line 2')

      const addRow2 = page.locator('.diff-row.type-add').first()
      await expect(addRow2).toBeVisible()
      await expect(addRow2.locator('.diff-col.right .diff-line-content')).toContainText('Line 2 Modified')

      // Close the modal
      const closeBtn = page.locator('.diff-modal-close')
      await expect(closeBtn).toBeVisible()
      await closeBtn.click()

      // Verify modal is gone
      await expect(diffModalOverlay).toBeHidden()

    } finally {
      await app.close()
    }
  })

  test('should support Esc key closing, auto-scrolling to deep changes, and overview ruler', async () => {
    const { app, page } = await launchElectronApp()

    try {
      // Clear localStorage to ensure clean state
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Mock openDirectory dialog to load sandbox repo
      await app.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath }
        })
      }, sandbox.dir)

      // Click to add repository
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()

      // switch to the sandbox repository tab
      const tabs = page.locator('[data-testid="repo-tab"]')
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // Find the top commit "Modify large-sample.txt"
      const commitItems = page.locator('.commit-item')
      const topCommit = commitItems.first()
      await expect(topCommit).toContainText('Modify large-sample.txt')

      // 1. Select the commit
      await topCommit.click()
      await page.waitForTimeout(500)

      // Click the file item to open diff modal
      const fileItem = page.locator('.details-panel .file-item').first()
      await expect(fileItem).toContainText('large-sample.txt')
      await fileItem.click()
      await page.waitForTimeout(500)

      // Verify modal is visible
      const diffModalOverlay = page.locator('.diff-modal-overlay')
      await expect(diffModalOverlay).toBeVisible()

      // 2. Verify auto-scroll: container scroll position should be greater than 0 since change is deep (line 120)
      const scrollContainer = page.locator('.diff-modal-scroll')
      await expect(scrollContainer).toBeVisible()
      
      // Wait a tiny bit for the auto-scroll useEffect logic to run
      await page.waitForTimeout(300)

      const scrollTop = await scrollContainer.evaluate(el => el.scrollTop)
      expect(scrollTop).toBeGreaterThan(0)

      // 3. Verify scroll preview ruler
      const ruler = page.locator('.diff-overview-ruler')
      await expect(ruler).toBeVisible()
      const markers = ruler.locator('.diff-ruler-marker')
      await expect(markers).not.toHaveCount(0)

      // 4. Verify Esc key closes the modal
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      await expect(diffModalOverlay).toBeHidden()

    } finally {
      await app.close()
    }
  })

  test('should support keyboard arrow navigation and auto-scrolling of selected commits', async () => {
    // Generate 20 additional commits so we definitely have scrollable content
    for (let i = 1; i <= 20; i++) {
      await sandbox.createCommit(`scroll-test-${i}.txt`, `line ${i}\n`, `Scroll test commit ${i}`)
    }

    const { app, page } = await launchElectronApp()
    page.on('console', (msg) => {
      console.log(`[PAGE LOG] [${msg.type()}] ${msg.text()}`)
    })

    try {
      // Clear localStorage to ensure clean state
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Mock openDirectory dialog to load sandbox repo
      await app.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath }
        })
      }, sandbox.dir)

      // Click to add repository
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()

      // Switch to the sandbox repository tab
      const tabs = page.locator('[data-testid="repo-tab"]')
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // Verify we have 25 commits (5 original + 20 new)
      const commitItems = page.locator('.commit-item')
      await expect(commitItems).toHaveCount(25)

      // Top commit (index 0) should be active by default
      const topCommit = commitItems.first()
      await expect(topCommit).toHaveClass(/active/)

      // Focus the graph container by clicking the already active top commit
      const graphContainer = page.locator('.graph-container')
      await topCommit.click()
      await page.waitForTimeout(200)

      // Press ArrowDown to navigate to index 1
      await page.keyboard.press('ArrowDown')
      await page.waitForTimeout(300)
      
      const secondCommit = commitItems.nth(1)
      await expect(secondCommit).toHaveClass(/active/)
      await expect(topCommit).not.toHaveClass(/active/)

      // Verify the details panel loaded files for this second commit
      const detailsTitle = page.locator('.details-panel .details-title')
      await expect(detailsTitle).toBeVisible()

      // Press ArrowUp to navigate back to index 0
      await page.keyboard.press('ArrowUp')
      await page.waitForTimeout(300)
      await expect(topCommit).toHaveClass(/active/)
      await expect(secondCommit).not.toHaveClass(/active/)

      // Check initial scroll height of .graph-container (should be 0 or very close)
      const initialScrollTop = await graphContainer.evaluate(el => el.scrollTop)
      expect(initialScrollTop).toBe(0)

      // Keep pressing ArrowDown to navigate to the bottom commit (index 24)
      for (let i = 0; i < 24; i++) {
        await page.keyboard.press('ArrowDown')
        // Small delay to let scroll/state updates happen
        await page.waitForTimeout(50)
      }
      await page.waitForTimeout(500)

      // The last commit (index 24) should be active now
      const lastCommit = commitItems.last()
      await expect(lastCommit).toHaveClass(/active/)

      // The container should have scrolled down to follow the selection
      const scrolledScrollTop = await graphContainer.evaluate(el => el.scrollTop)
      expect(scrolledScrollTop).toBeGreaterThan(0)

      // Press ArrowUp to go back up one step
      await page.keyboard.press('ArrowUp')
      await page.waitForTimeout(300)
      const secondLastCommit = commitItems.nth(23)
      await expect(secondLastCommit).toHaveClass(/active/)

    } finally {
      await app.close()
    }
  })

  test('should support binary file detection in diff modal', async () => {
    // 1. Commit a mock binary file containing null bytes to the sandbox
    console.log('[Binary File Diff Test] 1. Creating and committing a binary file...');
    fs.writeFileSync(path.join(sandbox.dir, 'mock-image.png'), 'PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89')
    await sandbox.git.add('mock-image.png')
    await sandbox.git.commit('Add binary mock-image.png')

    console.log('[Binary File Diff Test] 2. Launching Electron App...');
    const { app, page } = await launchElectronApp()

    try {
      console.log('[Binary File Diff Test] 3. Clearing localStorage...');
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      console.log('[Binary File Diff Test] 4. Mocking dialog:openDirectory...');
      await app.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath }
        })
      }, sandbox.dir)

      console.log('[Binary File Diff Test] 5. Clicking to add repository...');
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()

      console.log('[Binary File Diff Test] 6. Switching to sandbox repository tab...');
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      console.log('[Binary File Diff Test] 7. Finding top commit adding binary file...');
      const commitItems = page.locator('.commit-item')
      const topCommit = commitItems.first()
      await expect(topCommit).toContainText('Add binary mock-image.png')

      console.log('[Binary File Diff Test] 8. Selecting commit...');
      await topCommit.click()
      await page.waitForTimeout(500)

      console.log('[Binary File Diff Test] 9. Clicking file item to open diff...');
      const fileItem = page.locator('.details-panel .file-item').first()
      await expect(fileItem).toContainText('mock-image.png')
      await fileItem.click()
      await page.waitForTimeout(500)

      console.log('[Binary File Diff Test] 10. Asserting binary placeholder message in DiffModal...');
      const diffModalOverlay = page.locator('.diff-modal-overlay')
      await expect(diffModalOverlay).toBeVisible()

      const binaryPlaceholder = page.locator('[data-testid="binary-file-placeholder"]')
      await expect(binaryPlaceholder).toBeVisible()
      await expect(binaryPlaceholder).toContainText('Binary file (diff not available as text)')

      console.log('[Binary File Diff Test] 11. Closing diff modal...');
      await page.keyboard.press('Escape')
      await expect(diffModalOverlay).toBeHidden()
      console.log('[Binary File Diff Test] Binary file E2E test finished successfully!')

    } finally {
      await app.close()
    }
  })
})
