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

  test('should support pop stash with conflicts and display the conflict banner', async () => {
    console.log('[Stash Conflict Test] 1. Initializing stash content in sandbox...');
    fs.writeFileSync(path.join(sandbox.dir, 'README.md'), '# Initial README\n')
    await sandbox.git.add('README.md')
    await sandbox.git.commit('Initial commit')

    console.log('[Stash Conflict Test] 2. Modifying and stashing README...');
    fs.writeFileSync(path.join(sandbox.dir, 'README.md'), '# Initial README\nStashed modification\n')
    await sandbox.git.stash(['push', '-m', 'Stash to pop with conflict'])

    console.log('[Stash Conflict Test] 3. Making conflicting modification on active branch...');
    fs.writeFileSync(path.join(sandbox.dir, 'README.md'), '# Initial README\nConflicting branch modification\n')
    await sandbox.git.add('README.md')
    await sandbox.git.commit('Commit conflicting branch modification')

    console.log('[Stash Conflict Test] 4. Launching Electron App...');
    const { app, page } = await launchElectronApp()

    // Listen for browser logs and page errors
    page.on('console', msg => console.log('  [BROWSER CONSOLE]', msg.text()));
    page.on('pageerror', err => console.error('  [BROWSER ERROR]', err.message));

    try {
      console.log('[Stash Conflict Test] 5. Clearing localStorage...');
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      console.log('[Stash Conflict Test] 6. Mocking dialog:openDirectory...');
      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, sandbox.dir)

      console.log('[Stash Conflict Test] 7. Adding sandbox repository...');
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()

      console.log('[Stash Conflict Test] 8. Switching to repository tab...');
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      console.log('[Stash Conflict Test] 9. Verifying stash entry in sidebar...');
      const stashItem = page.locator('[data-testid="stash-item-0"]')
      await expect(stashItem).toBeVisible()
      await expect(stashItem).toContainText('Stash to pop with conflict')

      console.log('[Stash Conflict Test] 10. Selecting stash entry...');
      await stashItem.click()
      await page.waitForTimeout(300)

      const popBtn = page.locator('[data-testid="stash-pop-btn-0"]')
      await expect(popBtn).toBeVisible()

      console.log('[Stash Conflict Test] 11. Mocking showMessageBox to Confirm Pop...');
      await app.evaluate(async ({ ipcMain }) => {
        ipcMain.removeHandler('dialog:showMessageBox')
        ipcMain.handle('dialog:showMessageBox', async () => {
          return { success: true, response: 1 } // Confirm index 1
        })
      })

      console.log('[Stash Conflict Test] 12. Clicking Pop button...');
      await popBtn.click()
      await page.waitForTimeout(2000) // Increase wait to let git finish

      console.log('[Stash Conflict Test] Debugging repository state...');
      const debugStatus = await sandbox.git.status();
      const debugStashes = await sandbox.git.stashList();
      console.log('[Stash Conflict Test] Conflicted files:', debugStatus.conflicted);
      console.log('[Stash Conflict Test] Git status files:', debugStatus.files);
      console.log('[Stash Conflict Test] Remaining stashes count:', debugStashes.total);

      console.log('[Stash Conflict Test] 13. Verifying stash conflict banner is visible...');
      const conflictBanner = page.locator('[data-testid="stash-conflict-banner"]')
      await expect(conflictBanner).toBeVisible()
      await expect(conflictBanner).toContainText('Conflicts detected')

      console.log('[Stash Conflict Test] 14. Checking git status for conflicts on disk...');
      const gitStatus = await sandbox.git.status()
      expect(gitStatus.conflicted).toContain('README.md')
      console.log('[Stash Conflict Test] Stash pop conflict test finished successfully!');

    } finally {
      console.log('Closing app...');
      await app.close()
    }
  })

  test('should support collapsing/expanding and persistence in localStorage for the stashes section', async () => {
    console.log('[Stash Collapse Test] 1. Initializing stash content in sandbox...');
    fs.writeFileSync(path.join(sandbox.dir, 'README.md'), '# Initial README\n')
    await sandbox.git.add('README.md')
    await sandbox.git.commit('Initial commit')

    fs.writeFileSync(path.join(sandbox.dir, 'README.md'), '# Initial README\nModified line in stash\n')
    await sandbox.git.stash(['push', '-m', 'Stash to collapse/expand'])

    console.log('[Stash Collapse Test] 2. Launching Electron App...');
    const { app, page } = await launchElectronApp()

    try {
      console.log('[Stash Collapse Test] 3. Clearing localStorage...');
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      console.log('[Stash Collapse Test] 4. Mocking dialog:openDirectory...');
      await app.evaluate(async ({ ipcMain }, repoPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: repoPath }
        })
      }, sandbox.dir)

      console.log('[Stash Collapse Test] 5. Adding sandbox repository...');
      const addBtn = page.locator('[data-testid="add-repo-btn"]')
      await expect(addBtn).toBeVisible()
      await addBtn.click()

      console.log('[Stash Collapse Test] 6. Switching to repository tab...');
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      console.log('[Stash Collapse Test] 7. Verifying stash entry is visible initially...');
      const stashItem = page.locator('[data-testid="stash-item-0"]')
      await expect(stashItem).toBeVisible()

      console.log('[Stash Collapse Test] 8. Collapsing stashes section...');
      const stashesHeader = page.locator('[data-testid="sidebar-stashes-header"]')
      await expect(stashesHeader).toBeVisible()
      await stashesHeader.click()
      await page.waitForTimeout(500)

      console.log('[Stash Collapse Test] 9. Verifying stash entry is NOT visible...');
      await expect(stashItem).not.toBeVisible()

      console.log('[Stash Collapse Test] 10. Verifying localStorage has saved collapsed state as true...');
      const collapsedStorageValue = await page.evaluate(() => localStorage.getItem('sidebar-stashes-collapsed'))
      expect(collapsedStorageValue).toBe('true')

      console.log('[Stash Collapse Test] 11. Expanding stashes section...');
      await stashesHeader.click()
      await page.waitForTimeout(500)

      console.log('[Stash Collapse Test] 12. Verifying stash entry is visible again...');
      await expect(stashItem).toBeVisible()

      console.log('[Stash Collapse Test] 13. Verifying localStorage has saved collapsed state as false...');
      const expandedStorageValue = await page.evaluate(() => localStorage.getItem('sidebar-stashes-collapsed'))
      expect(expandedStorageValue).toBe('false')

      console.log('[Stash Collapse Test] 14. Testing persistence across reload...');
      // Explicitly collapse section, reload and check
      await stashesHeader.click()
      await page.waitForTimeout(500)
      await expect(stashItem).not.toBeVisible()

      console.log('[Stash Collapse Test] 15. Reloading page...');
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      console.log('[Stash Collapse Test] 16. Verifying section starts collapsed...');
      await expect(stashItem).not.toBeVisible()

      console.log('[Stash Collapse Test] 17. Expanding section after reload...');
      await stashesHeader.click()
      await page.waitForTimeout(500)
      await expect(stashItem).toBeVisible()

    } finally {
      console.log('Closing app...');
      await app.close()
    }
  })
})

