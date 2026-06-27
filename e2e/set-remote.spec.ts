import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import fs from 'fs'

test.describe('Set Remote on Push', () => {
  let localSandbox: GitSandbox
  let remoteSandbox: GitSandbox

  test.beforeEach(async () => {
    // 1. Remote repository acting as upstream (initialize as bare repository)
    remoteSandbox = new GitSandbox()
    await remoteSandbox.git.init(true)

    // 2. Local repository initialized locally with no remotes
    localSandbox = new GitSandbox()
    await localSandbox.init()
    await localSandbox.git.branch(['-M', 'main'])
  })

  test.afterEach(async () => {
    await localSandbox.destroy()
    await remoteSandbox.destroy()
  })

  test('should prompt to set remote on push failure and complete push successfully', async () => {
    console.log('1. Launching Electron App...')
    const { app, page } = await launchElectronApp()

    try {
      console.log('2. Clearing localStorage...')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      console.log('3. Mocking dialog:openDirectory to load local repository...')
      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, localSandbox.dir)

      console.log('4. Adding local repository...')
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()

      console.log('5. Clicking local repository tab...')
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // Add a commit locally to have something to push
      await localSandbox.createCommit('changes.txt', 'some changes', 'Commit to push')
      await page.waitForTimeout(500)

      // Mock dialog response to select "Configure" (index 1) when prompted
      console.log('6. Mocking dialog:showMessageBox to click Configure...')
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('dialog:showMessageBox')
        ipcMain.handle('dialog:showMessageBox', async (_, options) => {
          if (options.message && options.message.includes('no remote configured')) {
            return { success: true, response: 1 } // Index 1 is 'Configure'
          }
          return { success: true, response: 0 }
        })
      })

      console.log('7. Clicking Push button to trigger warning dialog...')
      const pushBtn = page.locator('[data-testid="push-btn"]')
      await expect(pushBtn).toBeVisible()
      await pushBtn.click()

      console.log('8. Verifying Set Remote modal is visible...')
      const modal = page.locator('.diff-modal-content')
      await expect(modal).toBeVisible()
      await expect(modal).toContainText('Set Remote & Push')

      // Verify active branch name is pre-filled in textbox
      const branchInput = page.locator('[data-testid="remote-branch-input"]')
      await expect(branchInput).toHaveValue('main')

      // Fill in Remote Name and Remote URL
      console.log('9. Filling remote information...')
      const remoteInput = page.locator('[data-testid="remote-name-input"]')
      await remoteInput.fill('origin')

      const urlInput = page.locator('[data-testid="remote-url-input"]')
      await urlInput.fill(remoteSandbox.dir)

      console.log('10. Submitting configuration...')
      const submitBtn = page.locator('[data-testid="remote-submit-btn"]')
      await expect(submitBtn).toBeEnabled()
      await submitBtn.click()

      console.log('11. Verifying modal disappears on success...')
      await expect(modal).not.toBeVisible({ timeout: 15000 })

      // Verify that local sandbox now has origin remote
      const remotes = await localSandbox.git.getRemotes(true)
      expect(remotes.length).toBeGreaterThan(0)
      expect(remotes[0].name).toBe('origin')

      console.log('Set Remote via failure prompt succeeded!')
    } finally {
      await app.close()
    }
  })

  test('should allow setting remote manually via push dropdown option', async () => {
    console.log('1. Launching Electron App...')
    const { app, page } = await launchElectronApp()

    try {
      console.log('2. Clearing localStorage...')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      console.log('3. Mocking dialog:openDirectory to load local repository...')
      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, localSandbox.dir)

      console.log('4. Adding local repository...')
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()

      console.log('5. Clicking local repository tab...')
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // Add a commit locally to have something to push
      await localSandbox.createCommit('changes-2.txt', 'some changes 2', 'Commit to push 2')
      await page.waitForTimeout(500)

      console.log('6. Clicking Push dropdown toggle...')
      const dropdownToggle = page.locator('[data-testid="push-dropdown-btn"]')
      await expect(dropdownToggle).toBeVisible()
      await dropdownToggle.click()

      console.log('7. Clicking Set Remote option...')
      const setRemoteOption = page.locator('[data-testid="set-remote-option"]')
      await expect(setRemoteOption).toBeVisible()
      await setRemoteOption.click()

      console.log('8. Verifying Set Remote modal is visible...')
      const modal = page.locator('.diff-modal-content')
      await expect(modal).toBeVisible()

      const branchInput = page.locator('[data-testid="remote-branch-input"]')
      await expect(branchInput).toHaveValue('main')

      // Fill URL
      const urlInput = page.locator('[data-testid="remote-url-input"]')
      await urlInput.fill(remoteSandbox.dir)

      console.log('9. Submitting remote manually...')
      const submitBtn = page.locator('[data-testid="remote-submit-btn"]')
      await submitBtn.click()

      console.log('10. Verifying modal disappears on success...')
      await expect(modal).not.toBeVisible({ timeout: 15000 })

      // Verify remote is configured
      const remotes = await localSandbox.git.getRemotes(true)
      expect(remotes.length).toBeGreaterThan(0)
      expect(remotes[0].name).toBe('origin')

      console.log('Set Remote manually succeeded!')
    } finally {
      await app.close()
    }
  })

  test('should show manual remote creation links if push fails with repository not found and no PAT identity is configured', async () => {
    console.log('1. Launching Electron App...')
    const { app, page } = await launchElectronApp()

    try {
      console.log('2. Clearing localStorage (without any identities)...')
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      console.log('3. Mocking dialog:openDirectory to load local repository...')
      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, localSandbox.dir)

      console.log('4. Adding local repository...')
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await addBtn.click()

      console.log('5. Clicking local repository tab...')
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // Add a commit locally to have something to push
      await localSandbox.createCommit('changes-3.txt', 'some changes 3', 'Commit to push 3')
      await page.waitForTimeout(500)

      // Mock git:push to simulate repository not found
      console.log('6. Mocking git:push to return Repository Not Found error...')
      await app.evaluate(async ({ ipcMain }) => {
        ipcMain.removeHandler('git:push')
        ipcMain.handle('git:push', async () => {
          return { success: false, error: 'remote: Repository not found. fatal: repository https://github.com/CamelDev/testrepo.git not found' }
        })
      })

      console.log('7. Triggering set remote modal manually...')
      const dropdownToggle = page.locator('[data-testid="push-dropdown-btn"]')
      await dropdownToggle.click()
      const setRemoteOption = page.locator('[data-testid="set-remote-option"]')
      await setRemoteOption.click()

      const modal = page.locator('.diff-modal-content')
      await expect(modal).toBeVisible()

      // Fill a URL that is a github URL
      const urlInput = page.locator('[data-testid="remote-url-input"]')
      await urlInput.fill('https://github.com/CamelDev/testrepo.git')

      console.log('8. Clicking Push to trigger error...')
      const submitBtn = page.locator('[data-testid="remote-submit-btn"]')
      await submitBtn.click()

      // Error message should show up in modal
      console.log('9. Checking error message and manual links...')
      const errorMsg = page.locator('[data-testid="remote-error-message"]')
      await expect(errorMsg).toBeVisible()
      await expect(errorMsg).toContainText('not found')

      // Since there is no token configured, the "Create on GitHub" manual link should be displayed
      const githubLink = page.locator('[data-testid="create-on-github-link"]')
      await expect(githubLink).toBeVisible()
      await expect(githubLink).toHaveAttribute('href', 'https://github.com/new')

      console.log('Manual remote creation links verified!')
    } finally {
      await app.close()
    }
  })

  test('should automatically create repository and push if push fails with repository not found and PAT identity is configured', async () => {
    console.log('1. Launching Electron App...')
    const { app, page } = await launchElectronApp()

    try {
      console.log('2. Seeding localStorage with GitHub Identity PAT...')
      await page.evaluate(() => {
        localStorage.clear()
        localStorage.setItem('global-identities', JSON.stringify([
          {
            id: 'mock-identity-github',
            label: 'Mock GitHub Identity',
            name: 'Mock User',
            email: 'mock@example.com',
            provider: 'github',
            username: 'CamelDev',
            personalAccessToken: 'ghp_mocktoken12345'
          }
        ]))
      })
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      console.log('3. Mocking dialog:openDirectory to load local repository...')
      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, localSandbox.dir)

      console.log('4. Adding local repository...')
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await addBtn.click()

      console.log('5. Clicking local repository tab...')
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // Select identity in UI toolbar
      console.log('5.1. Selecting seeded identity from selector...')
      const select = page.locator('.sync-actions-panel select')
      await select.selectOption('mock-identity-github')
      await page.waitForTimeout(500)

      // Add a commit locally to have something to push
      await localSandbox.createCommit('changes-4.txt', 'some changes 4', 'Commit to push 4')
      await page.waitForTimeout(500)

      // Mock git:push to simulate repository not found on first push, and success on second push
      // Also mock git:createRemoteRepo and git:addRemote
      console.log('6. Mocking git IPC handlers...')
      await app.evaluate(async ({ ipcMain }) => {
        let pushCount = 0
        ipcMain.removeHandler('git:push')
        ipcMain.handle('git:push', async () => {
          pushCount++
          if (pushCount === 1) {
            return { success: false, error: 'remote: Repository not found. fatal: repository https://github.com/CamelDev/testrepo.git not found' }
          }
          return { success: true }
        })

        ipcMain.removeHandler('git:createRemoteRepo')
        ipcMain.handle('git:createRemoteRepo', async () => {
          return { success: true, data: { name: 'testrepo' } }
        })

        ipcMain.removeHandler('git:addRemote')
        ipcMain.handle('git:addRemote', async () => {
          return { success: true }
        })
      })

      console.log('7. Triggering set remote modal manually...')
      const dropdownToggle = page.locator('[data-testid="push-dropdown-btn"]')
      await dropdownToggle.click()
      const setRemoteOption = page.locator('[data-testid="set-remote-option"]')
      await setRemoteOption.click()

      const modal = page.locator('.diff-modal-content')
      await expect(modal).toBeVisible()

      // Fill a URL that is a github URL
      const urlInput = page.locator('[data-testid="remote-url-input"]')
      await urlInput.fill('https://github.com/CamelDev/testrepo.git')

      console.log('8. Clicking Push to trigger Repository Not Found error...')
      const submitBtn = page.locator('[data-testid="remote-submit-btn"]')
      await submitBtn.click()

      // Error message should show up in modal
      console.log('9. Checking error message and automatic creation UI...')
      const errorMsg = page.locator('[data-testid="remote-error-message"]')
      await expect(errorMsg).toBeVisible()
      await expect(errorMsg).toContainText('not found')

      // Since identity has PAT, the "Create Remote & Push" option button should show up
      const createRemoteBtn = page.locator('[data-testid="create-remote-and-push-btn"]')
      await expect(createRemoteBtn).toBeVisible()

      console.log('10. Clicking Create Remote & Push...')
      await createRemoteBtn.click()

      console.log('11. Verifying modal disappears after successful creation & push...')
      await expect(modal).not.toBeVisible({ timeout: 15000 })

      console.log('Automatic remote creation and push E2E verified successfully!')
    } finally {
      await app.close()
    }
  })
})
