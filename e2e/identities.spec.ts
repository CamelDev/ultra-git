import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import path from 'path'
import fs from 'fs'

test.describe('Git Identities Feature', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
  })

  test.afterEach(async () => {
    await sandbox.destroy()
  })

  test('should support creating profiles, auto-assigning single profile, and dropdown selection', async () => {
    const { app, page } = await launchElectronApp()
    
    try {
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

      // Add repo
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await addBtn.click()

      // Switch to repo tab
      const tabs = page.locator('[data-testid="repo-tab"]')
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // 1. Open identities modal via Settings Cog dropdown
      const cogBtn = page.locator('[data-testid="settings-cog-btn"]')
      await expect(cogBtn).toBeVisible()
      await cogBtn.click()

      const manageBtn = page.locator('[data-testid="manage-identities-btn"]')
      await expect(manageBtn).toBeVisible()
      await manageBtn.click()

      // 2. Add first profile
      await page.fill('input[data-testid="label-input"]', 'Personal Profile')
      await page.fill('input[data-testid="name-input"]', 'Jane Personal')
      await page.fill('input[data-testid="email-input"]', 'jane.p@example.com')
      await page.click('button[data-testid="save-profile-btn"]')

      // Verify profile is listed in modal
      await expect(page.locator('.diff-modal-content').locator('text=Personal Profile')).toBeVisible()

      // Close modal
      await page.click('[data-testid="identities-close-btn"]')
      await page.waitForTimeout(500)

      // 3. Verify single profile auto-assignment
      const selectDropdown = page.locator('[data-testid="repo-identity-select"]')
      await expect(selectDropdown).toBeVisible()
      // Since it's the only identity, it should be auto-assigned
      await expect(selectDropdown).toHaveValue(/^[a-z0-9]+$/) // should be a random ID string

      // 4. Open modal again to add a second profile
      await cogBtn.click()
      await manageBtn.click()
      await page.fill('input[data-testid="label-input"]', 'Work Profile')
      await page.fill('input[data-testid="name-input"]', 'Jane Work')
      await page.fill('input[data-testid="email-input"]', 'jane.w@work.com')
      await page.click('button[data-testid="save-profile-btn"]')
      
      await expect(page.locator('.diff-modal-content').locator('text=Work Profile')).toBeVisible()
      await page.click('[data-testid="identities-close-btn"]')
      await page.waitForTimeout(500)

      // 5. Select "None" in the dropdown to trigger the selection required state
      await selectDropdown.selectOption('')
      
      // Write an unstaged file to trigger rendering of ActiveChanges and Toolbar commit panels
      fs.writeFileSync(path.join(sandbox.dir, 'some-change.txt'), 'some content')
      await page.waitForTimeout(2000) // Wait for FS watcher to refresh status

      // Warning banner and missing warn message should appear
      const warningBanner = page.locator('[data-testid="identity-required-banner"]')
      await expect(warningBanner).toBeVisible()

      const warningText = page.locator('[data-testid="identity-missing-warning"]')
      await expect(warningText).toBeVisible()
      await expect(warningText).toContainText('Select identity in log sync panel')

      // Commit button should be disabled
      const commitBtn = page.locator('[data-testid="commit-btn"]')
      await expect(commitBtn).toBeDisabled()

      // 6. Select "Work Profile" from the dropdown
      const workOptionValue = await page.evaluate(() => {
        const select = document.querySelector('[data-testid="repo-identity-select"]') as HTMLSelectElement
        const options = Array.from(select.options)
        const workOpt = options.find(o => o.text.includes('Work Profile'))
        return workOpt ? workOpt.value : ''
      })

      await selectDropdown.selectOption(workOptionValue)
      await page.waitForTimeout(500)

      // Warning banner and text should disappear
      await expect(warningBanner).not.toBeVisible()
      await expect(warningText).not.toBeVisible()

    } finally {
      await app.close()
    }
  })

  test('should support Git provider token connection, editing profiles, and setting credentials.helper', async () => {
    const { app, page } = await launchElectronApp()
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()))
    app.process().stdout?.on('data', data => console.log('MAIN PROCESS STDOUT:', data.toString()))
    app.process().stderr?.on('data', data => console.log('MAIN PROCESS STDERR:', data.toString()))

    try {
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

        // Mock token validation API
        ipcMain.removeHandler('git:validateToken')
        ipcMain.handle('git:validateToken', async (_, { provider, token }) => {
          if (token === 'valid_token') {
            return {
              success: true,
              data: {
                name: 'Kamil Camel',
                email: 'kamil@cameldev.com',
                username: 'CamelDev',
                avatarUrl: 'https://avatars.githubusercontent.com/u/123456'
              }
            }
          }
          return { success: false, error: 'Invalid mock token' }
        })
      }, sandbox.dir)

      // Add repo
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await addBtn.click()

      // Switch to repo tab
      const tabs = page.locator('[data-testid="repo-tab"]')
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // 1. Open identities modal via Settings Cog dropdown
      const cogBtn = page.locator('[data-testid="settings-cog-btn"]')
      await expect(cogBtn).toBeVisible()
      await cogBtn.click()

      const manageBtn = page.locator('[data-testid="manage-identities-btn"]')
      await manageBtn.click()

      // 2. Select GitHub Tab
      const githubTab = page.locator('[data-testid="provider-tab-github"]')
      await githubTab.click()

      // Enter invalid token and verify error
      await page.fill('[data-testid="token-input"]', 'bad_token')
      await page.click('[data-testid="connect-token-btn"]')
      const formError = page.locator('[data-testid="identity-form-error"]')
      await expect(formError).toBeVisible()
      await expect(formError).toContainText('Invalid mock token')

      // Enter valid token and verify success card
      await page.fill('[data-testid="token-input"]', 'valid_token')
      await page.click('[data-testid="connect-token-btn"]')
      await expect(formError).not.toBeVisible()

      const connectionCard = page.locator('[data-testid="connected-account-card"]')
      await expect(connectionCard).toBeVisible()
      await expect(connectionCard).toContainText('Kamil Camel')
      await expect(connectionCard).toContainText('CamelDev')

      // Fields should be pre-filled automatically
      await expect(page.locator('[data-testid="label-input"]')).toHaveValue('Github - CamelDev')
      await expect(page.locator('[data-testid="name-input"]')).toHaveValue('Kamil Camel')
      await expect(page.locator('[data-testid="email-input"]')).toHaveValue('kamil@cameldev.com')

      // Add profile
      await page.click('button[data-testid="save-profile-btn"]')

      // Profile should be listed on the left
      const profileRow = page.locator('[data-testid="profile-row-Github - CamelDev"]')
      await expect(profileRow).toBeVisible()
      await expect(profileRow).toContainText('Kamil Camel')

      // Close modal
      await page.click('[data-testid="identities-close-btn"]')
      await page.waitForTimeout(500)

      // Since it is the only profile, verify auto-assignment & config updates
      const selectDropdown = page.locator('[data-testid="repo-identity-select"]')
      await expect(selectDropdown).toBeVisible()
      await expect(selectDropdown).toHaveValue(/^[a-z0-9]+$/)

      // Check native git config using sandbox
      let userName = await sandbox.git.raw(['config', '--local', 'user.name'])
      let userEmail = await sandbox.git.raw(['config', '--local', 'user.email'])
      let credHelper = await sandbox.git.raw(['config', '--local', 'credential.helper'])

      expect(userName.trim()).toBe('Kamil Camel')
      expect(userEmail.trim()).toBe('kamil@cameldev.com')
      expect(credHelper.trim()).toContain('valid_token')

      // 3. Re-open modal and test Edit mode
      await cogBtn.click()
      await manageBtn.click()
      const editBtn = page.locator('[data-testid="edit-profile-Github - CamelDev"]')
      await editBtn.click()

      // Header should change to edit identity
      await expect(page.locator('[data-testid="form-header"]')).toContainText('Edit Identity Profile')

      // Modify the name, label and key
      await page.fill('[data-testid="label-input"]', 'GitHub - Edited Profile')
      await page.fill('[data-testid="name-input"]', 'Jane Edited')
      await page.fill('[data-testid="email-input"]', 'jane.edited@company.com')
      await page.click('[data-testid="save-profile-btn"]')

      // Verify the list updates immediately
      const updatedRow = page.locator('[data-testid="profile-row-GitHub - Edited Profile"]')
      await expect(updatedRow).toBeVisible()
      await expect(updatedRow).toContainText('Jane Edited')

      // Close modal
      await page.click('[data-testid="identities-close-btn"]')
      await page.waitForTimeout(500)

      // Verify local repository configurations adapted dynamically
      userName = await sandbox.git.raw(['config', '--local', 'user.name'])
      userEmail = await sandbox.git.raw(['config', '--local', 'user.email'])
      expect(userName.trim()).toBe('Jane Edited')
      expect(userEmail.trim()).toBe('jane.edited@company.com')

      // 4. Test delete profile unsets configurations
      await cogBtn.click()
      await manageBtn.click()
      const deleteBtn = page.locator('[data-testid="delete-profile-GitHub - Edited Profile"]')
      await deleteBtn.click()
      await page.click('[data-testid="identities-close-btn"]')

      // Poll to check that git config parameters are unset/cleared
      let nameCleared = false
      for (let i = 0; i < 15; i++) {
        const val = await sandbox.git.raw(['config', '--local', 'user.name'])
        if (!val || val.trim() === '') {
          nameCleared = true
          break
        }
        await page.waitForTimeout(200)
      }
      expect(nameCleared).toBe(true)

      let helperCleared = false
      for (let i = 0; i < 15; i++) {
        const val = await sandbox.git.raw(['config', '--local', 'credential.helper'])
        if (!val || val.trim() === '') {
          helperCleared = true
          break
        }
        await page.waitForTimeout(200)
      }
      expect(helperCleared).toBe(true)

    } finally {
      await app.close()
    }
  })

  test('should support Bitbucket token connection requiring email and configuring credential.helper with dynamic username', async () => {
    const { app, page } = await launchElectronApp()
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()))
    app.process().stdout?.on('data', data => console.log('MAIN PROCESS STDOUT:', data.toString()))
    app.process().stderr?.on('data', data => console.log('MAIN PROCESS STDERR:', data.toString()))

    try {
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

        // Mock token validation API
        ipcMain.removeHandler('git:validateToken')
        ipcMain.handle('git:validateToken', async (_, { provider, token, email }) => {
          if (provider === 'bitbucket') {
            if (!email) {
              return { success: false, error: 'Email parameter is missing' }
            }
            if (token === 'valid_bb_token' && email === 'bitbucket@cameldev.com') {
              return {
                success: true,
                data: {
                  name: 'Bitbucket Camel',
                  email: 'bitbucket@cameldev.com',
                  username: 'bb_camel',
                  avatarUrl: 'https://avatars.bitbucket.org/u/123456'
                }
              }
            }
          }
          return { success: false, error: 'Invalid mock credentials' }
        })
      }, sandbox.dir)

      // Add repo
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await addBtn.click()

      // Switch to repo tab
      const tabs = page.locator('[data-testid="repo-tab"]')
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // 1. Open identities modal via Settings Cog dropdown
      const cogBtn = page.locator('[data-testid="settings-cog-btn"]')
      await expect(cogBtn).toBeVisible()
      await cogBtn.click()

      const manageBtn = page.locator('[data-testid="manage-identities-btn"]')
      await manageBtn.click()

      // 2. Select Bitbucket Tab
      const bitbucketTab = page.locator('[data-testid="provider-tab-bitbucket"]')
      await bitbucketTab.click()

      // 3. Click connect without entering email first
      await page.fill('[data-testid="token-input"]', 'valid_bb_token')
      await page.click('[data-testid="connect-token-btn"]')
      const formError = page.locator('[data-testid="identity-form-error"]')
      await expect(formError).toBeVisible()
      await expect(formError).toContainText('Bitbucket API tokens require your Atlassian account email address')

      // 4. Fill in email, click connect, verify success
      await page.fill('[data-testid="email-input"]', 'bitbucket@cameldev.com')
      await page.click('[data-testid="connect-token-btn"]')
      await expect(formError).not.toBeVisible()

      const connectionCard = page.locator('[data-testid="connected-account-card"]')
      await expect(connectionCard).toBeVisible()
      await expect(connectionCard).toContainText('Bitbucket Camel')
      await expect(connectionCard).toContainText('bb_camel')

      // Fields should be pre-filled automatically
      await expect(page.locator('[data-testid="label-input"]')).toHaveValue('Bitbucket - bb_camel')
      await expect(page.locator('[data-testid="name-input"]')).toHaveValue('Bitbucket Camel')
      await expect(page.locator('[data-testid="email-input"]')).toHaveValue('bitbucket@cameldev.com')

      // Save profile
      await page.click('button[data-testid="save-profile-btn"]')

      // Profile should be listed on the left
      const profileRow = page.locator('[data-testid="profile-row-Bitbucket - bb_camel"]')
      await expect(profileRow).toBeVisible()

      // Close modal
      await page.click('[data-testid="identities-close-btn"]')
      await page.waitForTimeout(500)

      // Since it is the only profile, verify auto-assignment & config updates
      const selectDropdown = page.locator('[data-testid="repo-identity-select"]')
      await expect(selectDropdown).toBeVisible()
      await expect(selectDropdown).toHaveValue(/^[a-z0-9]+$/)

      // Poll to check that the Git config uses the dynamic username
      let helperSet = false
      let credHelper = ''
      for (let i = 0; i < 15; i++) {
        credHelper = await sandbox.git.raw(['config', '--local', 'credential.helper'])
        if (credHelper.trim().includes('username=bb_camel')) {
          helperSet = true
          break
        }
        await page.waitForTimeout(200)
      }
      expect(helperSet).toBe(true)
      expect(credHelper.trim()).toContain('password=valid_bb_token')

    } finally {
      await app.close()
    }
  })
})
