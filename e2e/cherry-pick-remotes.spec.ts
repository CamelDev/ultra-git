import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'

test.describe('Cherry-pick remote sources on demand', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])
    await sandbox.createBranch('local-feature')
    await sandbox.createCommit('local-file.txt', 'local content\n', 'Local change')
    await sandbox.checkoutBranch('main')
    await sandbox.createBranch('remote-source')
    await sandbox.createCommit('remote-file.txt', 'remote content\n', 'Remote-only change')
    const remoteHead = await sandbox.git.revparse(['HEAD'])
    await sandbox.checkoutBranch('main')
    await sandbox.git.raw(['update-ref', 'refs/remotes/origin/remote-only', remoteHead])
    await sandbox.git.raw(['branch', '-D', 'remote-source'])
  })

  test.afterEach(async () => { await sandbox.destroy() })

  async function openPicker() {
    const launched = await launchElectronApp({ disableDefaultTab: true })
    await launched.app.evaluate(({ ipcMain }, repoPath) => {
      ipcMain.removeHandler('dialog:openDirectory')
      ipcMain.handle('dialog:openDirectory', () => ({ canceled: false, path: repoPath }))
    }, sandbox.dir)
    await addRepoViaUI(launched.page)
    await expect.poll(() => launched.page.evaluate(() => (window as any).useRepoStore.getState().getActiveRepo()?.branches?.local.length)).toBe(2)
    await launched.page.getByTestId('cherry-pick-btn').click()
    return launched
  }

  test('hides remote options until requested, preserves selection, and resets on reopen', async () => {
    const { app, page } = await openPicker()
    try {
      const branches = page.getByTestId('cherry-pick-branch-select')
      const remotes = branches.locator('optgroup[label="Remote Branches"]')
      await expect(branches).toHaveValue('local-feature')
      await expect(remotes).toHaveCount(0)
      await expect(page.getByTestId('cherry-pick-file-local-file.txt')).toBeVisible()
      await page.getByRole('button', { name: 'Load remote branches', exact: true }).click()
      await expect(remotes.locator('option')).toHaveText(['origin/remote-only'])
      await expect(branches).toHaveValue('local-feature')

      await branches.selectOption('origin/remote-only')
      await expect(page.getByTestId('cherry-pick-file-remote-file.txt')).toBeVisible()
      await page.evaluate(async () => {
        const store = (window as any).useRepoStore.getState()
        await store.refreshRepo(store.activeId)
      })
      await expect(branches).toHaveValue('origin/remote-only')
      await page.getByTestId('cherry-pick-modal-close').click()
      await page.getByTestId('cherry-pick-btn').click()
      await expect(remotes).toHaveCount(0)
      await expect(branches).toHaveValue('local-feature')
      await expect(page.getByTestId('cherry-pick-file-local-file.txt')).toBeVisible()
      await page.getByRole('button', { name: 'Load remote branches', exact: true }).click()
      await branches.selectOption('origin/remote-only')
      await expect(page.getByTestId('cherry-pick-file-remote-file.txt')).toBeVisible()
      await page.getByTestId('cherry-pick-action-btn').click()
      await expect(page.getByTestId('cherry-pick-branch-select')).toBeHidden()
      await expect.poll(() => fs.existsSync(path.join(sandbox.dir, 'remote-file.txt'))).toBe(true)
      expect(fs.readFileSync(path.join(sandbox.dir, 'remote-file.txt'), 'utf8')).toBe('remote content\n')
    } finally { await app.close() }
  })

  test('remote loading can fail and retry without changing the local selection', async () => {
    const { app, page } = await openPicker()
    try {
      const branches = page.getByTestId('cherry-pick-branch-select')
      await expect(branches).toHaveValue('local-feature')
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('git:getBranches')
        ipcMain.handle('git:getBranches', () => ({ success: false, error: 'Could not read remote branches' }))
      })
      await page.getByRole('button', { name: 'Load remote branches', exact: true }).click()
      await expect(page.getByRole('alert')).toHaveText('Could not read remote branches')
      await expect(branches).toHaveValue('local-feature')
      await expect(branches.locator('optgroup[label="Remote Branches"]')).toHaveCount(0)
      await expect(page.getByTestId('cherry-pick-file-local-file.txt')).toBeVisible()
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('git:getBranches')
        ipcMain.handle('git:getBranches', () => ({ success: true, data: {
          current: 'main',
          local: [{ name: 'local-feature', ahead: 0, behind: 0 }, { name: 'main', ahead: 0, behind: 0 }],
          remote: ['origin/remote-only']
        } }))
      })
      await page.getByRole('button', { name: 'Retry remote branches', exact: true }).click()
      await expect(branches.locator('optgroup[label="Remote Branches"] option')).toHaveText(['origin/remote-only'])
      await expect(branches).toHaveValue('local-feature')
      await expect(page.getByRole('alert')).toHaveCount(0)
    } finally { await app.close() }
  })
})
