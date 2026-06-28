import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import fs from 'fs'
import path from 'path'

test.describe('Cherry Pick Feature', () => {
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

  test('should successfully cherry pick a commit from another branch', async () => {
    console.log('1. Setting up branches and commits...')
    // Create new branch and commit a file
    await sandbox.createBranch('feature-branch')
    await sandbox.createCommit('feature-file.txt', 'Feature file content\nLine 2\n', 'Feature commit message')

    // Switch back to main branch
    await sandbox.checkoutBranch('main')

    console.log('2. Launching Electron app...')
    const { app, page } = await launchElectronApp()

    try {
      console.log('3. Registering sandbox repo in app...')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)

      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, sandbox.dir)

      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()

      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(500)

      console.log('4. Clicking "Cherry pick from ..." button...')
      const cherryPickBtn = page.locator('[data-testid="cherry-pick-btn"]')
      await expect(cherryPickBtn).toBeVisible()
      await cherryPickBtn.click()

      console.log('5. Verifying Cherry Pick modal is visible...')
      const branchSelect = page.locator('[data-testid="cherry-pick-branch-select"]')
      await expect(branchSelect).toBeVisible()

      console.log('6. Selecting feature-branch...')
      await branchSelect.selectOption('feature-branch')
      await page.waitForTimeout(300)

      console.log('7. Selecting the commit...')
      const commitSelect = page.locator('[data-testid="cherry-pick-commit-select"]')
      await expect(commitSelect).toBeVisible()

      console.log('8. Verifying file list in modal...')
      const fileItem = page.locator('[data-testid="cherry-pick-file-feature-file.txt"]')
      await expect(fileItem).toBeVisible()
      await expect(fileItem).toContainText('feature-file.txt')

      console.log('9. Clicking Cherry Pick action button...')
      const actionBtn = page.locator('[data-testid="cherry-pick-action-btn"]')
      await expect(actionBtn).toBeVisible()
      await actionBtn.click()

      console.log('10. Verifying file has been cherry picked onto main...')
      await page.waitForTimeout(1000)
      const fileExists = fs.existsSync(path.join(sandbox.dir, 'feature-file.txt'))
      expect(fileExists).toBe(true)

      const fileContent = fs.readFileSync(path.join(sandbox.dir, 'feature-file.txt'), 'utf8')
      expect(fileContent).toContain('Feature file content')
      console.log('Cherry-pick successful!')
    } finally {
      await app.close()
    }
  })

  test('should handle conflicts during cherry pick and support aborting', async () => {
    console.log('1. Setting up conflict file on main...')
    fs.writeFileSync(path.join(sandbox.dir, 'conflict.txt'), 'Line 1\nOriginal line 2\nLine 3\n')
    await sandbox.git.add('conflict.txt')
    await sandbox.git.commit('Commit conflict base')

    console.log('2. Creating conflict branch and committing changes...')
    await sandbox.createBranch('conflict-branch')
    fs.writeFileSync(path.join(sandbox.dir, 'conflict.txt'), 'Line 1\nBranch change line 2\nLine 3\n')
    await sandbox.git.add('conflict.txt')
    await sandbox.git.commit('Branch conflict commit')

    console.log('3. Returning to main and committing different changes...')
    await sandbox.checkoutBranch('main')
    fs.writeFileSync(path.join(sandbox.dir, 'conflict.txt'), 'Line 1\nMain change line 2\nLine 3\n')
    await sandbox.git.add('conflict.txt')
    await sandbox.git.commit('Main conflicting commit')

    console.log('4. Launching Electron app...')
    const { app, page } = await launchElectronApp()

    try {
      console.log('5. Registering sandbox repo in app...')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)

      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, sandbox.dir)

      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await addBtn.click()

      const tabs = page.locator('[data-testid="repo-tab"]')
      await tabs.last().click()
      await page.waitForTimeout(500)

      console.log('6. Clicking "Cherry pick from ..." button...')
      const cherryPickBtn = page.locator('[data-testid="cherry-pick-btn"]')
      await cherryPickBtn.click()

      console.log('7. Selecting conflict-branch...')
      const branchSelect = page.locator('[data-testid="cherry-pick-branch-select"]')
      await branchSelect.selectOption('conflict-branch')
      await page.waitForTimeout(300)

      console.log('8. Selecting the conflict commit...')
      const commitSelect = page.locator('[data-testid="cherry-pick-commit-select"]')
      await expect(commitSelect).toBeVisible()

      console.log('9. Clicking Cherry Pick action button to trigger conflict...')
      const actionBtn = page.locator('[data-testid="cherry-pick-action-btn"]')
      await actionBtn.click()

      console.log('10. Verifying Conflict Resolver modal is opened...')
      await page.waitForTimeout(1000)
      const conflictTitle = page.locator('span:has-text("Cherry-pick in progress")')
      await expect(conflictTitle).toBeVisible()

      console.log('11. Clicking Abort Cherry-pick button...')
      const abortBtn = page.locator('[data-testid="abort-merge-btn"]')
      await expect(abortBtn).toBeVisible()
      await expect(abortBtn).toContainText('Abort Cherry-pick')
      await abortBtn.click()

      console.log('12. Verifying Conflict Resolver is closed...')
      await page.waitForTimeout(1000)
      await expect(conflictTitle).not.toBeVisible()

      // Verify Git status is clean (or has no merge/cherry-pick head)
      const isCherryPickHeadGone = !fs.existsSync(path.join(sandbox.dir, '.git', 'CHERRY_PICK_HEAD'))
      expect(isCherryPickHeadGone).toBe(true)
      console.log('Conflict abort successful!')
    } finally {
      await app.close()
    }
  })
})
