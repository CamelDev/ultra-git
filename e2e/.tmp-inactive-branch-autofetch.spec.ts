import { test, expect } from '@playwright/test'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import fs from 'fs'

test('temporary diagnosis: fetch then refresh updates inactive branch divergence badges', async () => {
  const remote = new GitSandbox()
  await remote.init()
  await remote.git.branch(['-M', 'main'])

  const local = new GitSandbox()
  fs.rmSync(local.dir, { recursive: true, force: true })
  await require('simple-git')().clone(remote.dir, local.dir)
  await local.git.addConfig('user.name', 'Test User', false, 'local')
  await local.git.addConfig('user.email', 'test@example.com', false, 'local')
  await remote.git.addConfig('receive.denyCurrentBranch', 'ignore', false, 'local')

  try {
    await local.git.checkoutLocalBranch('feature-sync-diagnosis')
    await local.git.push('origin', 'feature-sync-diagnosis', ['-u'])
    await local.createCommit('local-1.txt', 'one', 'local one')
    await local.createCommit('local-2.txt', 'two', 'local two')
    await local.git.checkout('main')

    await remote.git.checkout('feature-sync-diagnosis')
    await remote.createCommit('remote-1.txt', 'remote', 'remote one')

    const { app, page } = await launchElectronApp()
    try {
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await app.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => ({ canceled: false, path: sandboxPath }))
      }, local.dir)
      await addRepoViaUI(page)
      await page.locator('[data-testid="repo-tab"]').last().click()
      const branch = page.locator('[data-testid="sidebar-branch-feature-sync-diagnosis"]')
      await expect(branch).toBeVisible()
      await expect(branch.locator('[data-testid="branch-sync-badge"]')).not.toBeVisible()

      await page.locator('[data-testid="fetch-remote-branches-btn"]').click()
      await expect(branch.locator('[data-testid="sync-ahead"]')).toHaveText('↑2')
      await expect(branch.locator('[data-testid="sync-behind"]')).toHaveText('↓1')
    } finally {
      await app.close()
    }
  } finally {
    await local.destroy()
    await remote.destroy()
  }
})
