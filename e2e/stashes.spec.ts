import { test, expect } from '@playwright/test'
import { launchElectronApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import fs from 'fs'
import path from 'path'

test.describe('Git Stashes Improvements', () => {
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

  test('should display stash action buttons and support details view, pop confirmation, and delete confirmation', async () => {
    console.log('1. Initializing stash content in sandbox...');
    fs.writeFileSync(path.join(sandbox.dir, 'README.md'), '# Initial README\n')
    await sandbox.git.add('README.md')
    await sandbox.git.commit('Initial commit')

    fs.writeFileSync(path.join(sandbox.dir, 'README.md'), '# Initial README\nModified line in stash\n')
    fs.writeFileSync(path.join(sandbox.dir, 'untracked.txt'), 'Untracked file content\n')

    console.log('2. Stashing changes...');
    await sandbox.git.stash(['push', '-m', 'My Awesome Stash', '--include-untracked'])

    const stashList = await sandbox.git.stashList()
    expect(stashList.total).toBe(1)
    console.log('Stash successfully created in sandbox.');

    console.log('3. Launching Electron App...');
    const { app, page } = await launchElectronApp()
    console.log('Electron App launched.');

    try {
      console.log('4. Clearing localStorage...');
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)
      console.log('localStorage cleared and page reloaded.');

      console.log('5. Mocking dialog:openDirectory...');
      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, sandbox.dir)
      console.log('dialog:openDirectory mocked.');

      console.log('6. Clicking to add repository...');
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()
      console.log('add-repo-btn clicked.');

      console.log('7. Switching to the newly added repository tab...');
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)
      console.log('Switched to tab.');

      console.log('8. Verifying active branch...');
      const activeBranch = page.locator('[data-testid="sidebar-active-branch"]')
      await expect(activeBranch).toContainText('main')
      console.log('Active branch verified.');

      console.log('9. Verifying stash entry in sidebar...');
      const stashItem = page.locator('[data-testid="stash-item-0"]')
      await expect(stashItem).toBeVisible()
      await expect(stashItem).toContainText('My Awesome Stash')
      console.log('Stash entry verified in sidebar.');

      console.log('10. Selecting stash entry...');
      await stashItem.click()
      await page.waitForTimeout(300)
      console.log('Stash entry clicked.');

      const popBtn = page.locator('[data-testid="stash-pop-btn-0"]')
      const detailsBtn = page.locator('[data-testid="stash-details-btn-0"]')
      const deleteBtn = page.locator('[data-testid="stash-delete-btn-0"]')

      console.log('11. Verifying Pop, Details, Delete buttons...');
      await expect(popBtn).toBeVisible()
      await expect(detailsBtn).toBeVisible()
      await expect(deleteBtn).toBeVisible()
      console.log('Buttons verified.');

      console.log('12. Clicking Details button...');
      await detailsBtn.click()
      await page.waitForTimeout(500)
      console.log('Details button clicked.');

      console.log('13. Verifying DiffModal content...');
      const diffModal = page.locator('.diff-modal-content')
      await expect(diffModal).toBeVisible()
      await expect(diffModal).toContainText('Stash details: stash@0')

      const sidebarFiles = diffModal.locator('.diff-modal-sidebar')
      await expect(sidebarFiles).toBeVisible()
      await expect(sidebarFiles).toContainText('Stash Files')
      await expect(sidebarFiles).toContainText('README.md')
      await expect(sidebarFiles).toContainText('untracked.txt')
      console.log('DiffModal content verified.');

      console.log('14. Closing DiffModal...');
      const closeModalBtn = diffModal.locator('.diff-modal-close')
      await closeModalBtn.click()
      await page.waitForTimeout(300)
      await expect(diffModal).not.toBeVisible()
      console.log('DiffModal closed.');

      console.log('15. Stash entry is already selected, proceeding...');

      console.log('16. Mocking dialog:showMessageBox to Cancel (0)...');
      await app.evaluate(async ({ ipcMain }) => {
        ipcMain.removeHandler('dialog:showMessageBox')
        ipcMain.handle('dialog:showMessageBox', async () => {
          return { success: true, response: 0 }
        })
      })
      console.log('dialog:showMessageBox mocked.');

      console.log('17. Testing Delete Cancel...');
      await deleteBtn.click()
      await page.waitForTimeout(500)
      await expect(stashItem).toBeVisible()
      console.log('Delete Cancel verified.');

      console.log('18. Testing Pop Cancel...');
      await popBtn.click()
      await page.waitForTimeout(500)
      await expect(stashItem).toBeVisible()
      console.log('Pop Cancel verified.');

      console.log('19. Mocking dialog:showMessageBox to Confirm (1)...');
      await app.evaluate(async ({ ipcMain }) => {
        ipcMain.removeHandler('dialog:showMessageBox')
        ipcMain.handle('dialog:showMessageBox', async () => {
          return { success: true, response: 1 }
        })
      })
      console.log('dialog:showMessageBox mocked to confirm.');

      console.log('20. Testing Delete Confirm...');
      await deleteBtn.click()
      await page.waitForTimeout(800)
      await expect(stashItem).not.toBeVisible()
      console.log('Delete Confirm verified. Stash is gone.');

    } finally {
      console.log('Closing app...');
      await app.close()
      console.log('App closed.');
    }
  })
})
