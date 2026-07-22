import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import fs from 'fs'
import path from 'path'

test.describe('Squash Commits (This and Newer)', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])
    
    // Create multiple commits
    await sandbox.createCommit('file1.txt', 'Content for commit 1', 'First custom commit')
    await sandbox.createCommit('file2.txt', 'Content for commit 2', 'Second custom commit')
    await sandbox.createCommit('file3.txt', 'Content for commit 3', 'Third custom commit')
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('should successfully squash commits into one when worktree is clean', async () => {
    console.log('1. Launching Electron App...')
    const { app, page } = await launchElectronApp()
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()))
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.message))

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

      console.log('6. Finding the commit "Second custom commit" in the list...')
      const commitList = page.locator('.commit-list')
      await expect(commitList).toBeVisible()

      const secondCommitRow = page.locator('.commit-item', { hasText: 'Second custom commit' })
      await expect(secondCommitRow).toBeVisible()

      console.log('7. Hovering over the commit row to show action buttons...')
      await secondCommitRow.hover()
      await page.waitForTimeout(300)

      console.log('8. Clicking the squash button inside the commit row...')
      // Retrieve hash to locate data-testid
      const commitLog = await sandbox.git.log()
      const secondCustomCommit = commitLog.all.find(commit => commit.message === 'Second custom commit')
      expect(secondCustomCommit).toBeDefined()
      
      const squashBtn = secondCommitRow.locator(`[data-testid="commit-squash-btn-${secondCustomCommit!.hash}"]`)
      await expect(squashBtn).toBeVisible()
      await squashBtn.click()
      await page.waitForTimeout(300)

      console.log('9. Verifying that the squash modal is open...')
      const modal = page.locator('.diff-modal-content')
      await expect(modal).toBeVisible()
      await expect(modal).toContainText('Squash Commits (This and Newer)')
      await expect(modal).toContainText('Second custom commit')
      await expect(modal).toContainText('Third custom commit')

      console.log('10. Verifying default commit message...')
      const messageInput = page.locator('[data-testid="squash-message-input"]')
      await expect(messageInput).toBeVisible()
      const msgVal = await messageInput.inputValue()
      expect(msgVal).toContain('Second custom commit')
      expect(msgVal).toContain('Third custom commit')

      console.log('11. Modifying commit message...')
      await messageInput.fill('Squashed commits 2 & 3!')

      console.log('12. Confirming squash...')
      const confirmBtn = page.locator('[data-testid="confirm-squash-btn"]')
      await expect(confirmBtn).toBeVisible()
      await expect(confirmBtn).toBeEnabled()
      await confirmBtn.click()
      await page.waitForTimeout(1500)

      console.log('13. Verifying the squash modal is closed...')
      await expect(modal).not.toBeVisible()

      console.log('14. Checking repository history in git sandbox...')
      const finalLog = await sandbox.git.log()
      // We expect 3 commits: "Squashed commits 2 & 3!", "First custom commit", and the "Initial commit"
      expect(finalLog.all.length).toBe(3)
      expect(finalLog.all[0].message).toBe('Squashed commits 2 & 3!')
      expect(finalLog.all[1].message).toBe('First custom commit')
      expect(finalLog.all[2].message).toBe('Initial commit')
      
      console.log('Squash verified successfully.')
    } finally {
      await app.close()
    }
  })

  test('should successfully squash commits all the way down to the initial commit', async () => {
    console.log('1. Launching Electron App...')
    const { app, page } = await launchElectronApp()
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()))
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.message))

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

      console.log('6. Finding the commit "Initial commit" in the list...')
      const commitList = page.locator('.commit-list')
      await expect(commitList).toBeVisible()

      const initialCommitRow = page.locator('.commit-item', { hasText: 'Initial commit' })
      await expect(initialCommitRow).toBeVisible()

      console.log('7. Hovering over the commit row to show action buttons...')
      await initialCommitRow.hover()
      await page.waitForTimeout(300)

      console.log('8. Clicking the squash button inside the commit row...')
      const commitLog = await sandbox.git.log()
      const initialCommit = commitLog.all.find(commit => commit.message === 'Initial commit')
      expect(initialCommit).toBeDefined()
      
      const squashBtn = initialCommitRow.locator(`[data-testid="commit-squash-btn-${initialCommit!.hash}"]`)
      await expect(squashBtn).toBeVisible()
      await squashBtn.click()
      await page.waitForTimeout(300)

      console.log('9. Verifying that the squash modal is open...')
      const modal = page.locator('.diff-modal-content')
      await expect(modal).toBeVisible()
      await expect(modal).toContainText('Squash Commits (This and Newer)')
      await expect(modal).toContainText('Initial commit')

      console.log('10. Modifying commit message...')
      const messageInput = page.locator('[data-testid="squash-message-input"]')
      await expect(messageInput).toBeVisible()
      await messageInput.fill('Squashed everything!')

      console.log('11. Confirming squash...')
      const confirmBtn = page.locator('[data-testid="confirm-squash-btn"]')
      await expect(confirmBtn).toBeVisible()
      await expect(confirmBtn).toBeEnabled()
      await confirmBtn.click()
      await page.waitForTimeout(1500)

      console.log('12. Verifying the squash modal is closed...')
      await expect(modal).not.toBeVisible()

      console.log('13. Checking repository history in git sandbox...')
      const finalLog = await sandbox.git.log()
      // We expect exactly 1 commit: "Squashed everything!"
      expect(finalLog.all.length).toBe(1)
      expect(finalLog.all[0].message).toBe('Squashed everything!')
      
      console.log('Squash all the way to initial commit verified successfully.')
    } finally {
      await app.close()
    }
  })

  test('should display warning and disable confirm button when worktree is dirty', async () => {
    console.log('1. Making sandbox repository dirty...')
    // Modify file1.txt without committing
    fs.writeFileSync(path.join(sandbox.dir, 'file1.txt'), 'Dirty modifications')

    console.log('2. Launching Electron App...')
    const { app, page } = await launchElectronApp()
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()))
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.message))

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

      console.log('7. Finding the commit "Second custom commit" in the list...')
      const commitList = page.locator('.commit-list')
      await expect(commitList).toBeVisible()

      const secondCommitRow = page.locator('.commit-item', { hasText: 'Second custom commit' })
      await expect(secondCommitRow).toBeVisible()

      console.log('8. Hovering over the commit row to show action buttons...')
      await secondCommitRow.hover()
      await page.waitForTimeout(300)

      console.log('9. Clicking the squash button inside the commit row...')
      const commitLog = await sandbox.git.log()
      const secondCustomCommit = commitLog.all.find(commit => commit.message === 'Second custom commit')
      expect(secondCustomCommit).toBeDefined()
      
      const squashBtn = secondCommitRow.locator(`[data-testid="commit-squash-btn-${secondCustomCommit!.hash}"]`)
      await expect(squashBtn).toBeVisible()
      await squashBtn.click()
      await page.waitForTimeout(300)

      console.log('10. Verifying that the squash modal is open...')
      const modal = page.locator('.diff-modal-content')
      await expect(modal).toBeVisible()

      console.log('11. Verifying that dirty warning is shown...')
      const warningBox = page.locator('[data-testid="squash-dirty-warning"]')
      await expect(warningBox).toBeVisible()
      await expect(warningBox).toContainText('Uncommitted Changes Detected')

      console.log('12. Verifying that confirm button is disabled...')
      const confirmBtn = page.locator('[data-testid="confirm-squash-btn"]')
      await expect(confirmBtn).toBeVisible()
      await expect(confirmBtn).toBeDisabled()

      console.log('Dirty warning and disablement verified successfully.')
    } finally {
      await app.close()
    }
  })

  test('should successfully move tags to the new squashed commit when squashing commits with tags', async () => {
    console.log('1. Finding "Second custom commit" and adding a tag to it...')
    const commitLogBefore = await sandbox.git.log()
    const secondCustomCommit = commitLogBefore.all.find(commit => commit.message === 'Second custom commit')
    expect(secondCustomCommit).toBeDefined()
    await sandbox.git.raw(['tag', 'v1.0.13-test', secondCustomCommit!.hash])

    console.log('2. Launching Electron App...')
    const { app, page } = await launchElectronApp()
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()))
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.message))

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

      console.log('7. Finding the commit "Second custom commit" in the list...')
      const commitList = page.locator('.commit-list')
      await expect(commitList).toBeVisible()

      const secondCommitRow = page.locator('.commit-item', { hasText: 'Second custom commit' })
      await expect(secondCommitRow).toBeVisible()

      console.log('8. Hovering over the commit row to show action buttons...')
      await secondCommitRow.hover()
      await page.waitForTimeout(300)

      console.log('9. Clicking the squash button inside the commit row...')
      const squashBtn = secondCommitRow.locator(`[data-testid="commit-squash-btn-${secondCustomCommit!.hash}"]`)
      await expect(squashBtn).toBeVisible()
      await squashBtn.click()
      await page.waitForTimeout(300)

      console.log('10. Verifying that the squash modal is open...')
      const modal = page.locator('.diff-modal-content')
      await expect(modal).toBeVisible()

      console.log('11. Filling out the squash message...')
      const messageInput = page.locator('[data-testid="squash-message-input"]')
      await messageInput.fill('Squashed commits with tag!')

      console.log('12. Confirming squash...')
      const confirmBtn = page.locator('[data-testid="confirm-squash-btn"]')
      await confirmBtn.click()
      await page.waitForTimeout(1500)

      console.log('13. Verifying the squash modal is closed...')
      await expect(modal).not.toBeVisible()

      console.log('14. Checking that the tag was moved to the new squashed commit...')
      const finalLog = await sandbox.git.log()
      expect(finalLog.all.length).toBe(3)
      expect(finalLog.all[0].message).toBe('Squashed commits with tag!')
      
      const tagShow = await sandbox.git.show(['v1.0.13-test', '--oneline'])
      expect(tagShow).toContain(finalLog.all[0].hash.substring(0, 7))
      
      console.log('Tag moving during squash verified successfully.')
    } finally {
      await app.close()
    }
  })
})
