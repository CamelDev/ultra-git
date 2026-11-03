import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'

test.describe('Cherry-pick commit search', () => {
  let sandbox: GitSandbox
  let adaHash: string
  let graceHash: string
  let latestHash: string

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])
    await sandbox.createBranch('feature')
    await sandbox.git.addConfig('user.name', 'Ada Lovelace', false, 'local')
    await sandbox.git.addConfig('user.email', 'ada@example.test', false, 'local')
    await sandbox.createCommit('ada.txt', 'Ada change\n', 'Fix journey IDs [BE-12388]')
    adaHash = await sandbox.git.revparse(['HEAD'])
    await sandbox.git.addConfig('user.name', 'Grace Hopper', false, 'local')
    await sandbox.git.addConfig('user.email', 'grace@example.test', false, 'local')
    await sandbox.createCommit('grace.txt', 'Grace change\n', 'Improve checkout validation')
    graceHash = await sandbox.git.revparse(['HEAD'])
    await sandbox.git.addConfig('user.name', 'Ada Lovelace', false, 'local')
    await sandbox.git.addConfig('user.email', 'ada@example.test', false, 'local')
    await sandbox.createCommit('docs.txt', 'Documentation\n', 'Document availability flow')
    latestHash = await sandbox.git.revparse(['HEAD'])
    await sandbox.checkoutBranch('main')
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
    await expect(launched.page.getByTestId('cherry-pick-commit-select').locator('option')).toHaveCount(4)
    return launched
  }

  test('filters by hash, message, and author; clearing restores options and no matches disables the action', async () => {
    const { app, page } = await openPicker()
    try {
      const search = page.getByRole('searchbox', { name: 'Filter commits', exact: true })
      const commits = page.getByTestId('cherry-pick-commit-select')
      const options = commits.locator('option')
      await search.fill(adaHash.slice(0, 9).toUpperCase())
      await expect(options).toHaveCount(1)
      await expect(commits).toHaveValue(adaHash)
      await expect(page.getByTestId('cherry-pick-file-ada.txt')).toBeVisible()
      await search.fill('[be-12388]')
      await expect(options).toHaveCount(1)
      await expect(commits).toHaveValue(adaHash)
      await search.fill('GRACE HOPPER')
      await expect(options).toHaveCount(1)
      await expect(commits).toHaveValue(graceHash)
      await expect(page.getByTestId('cherry-pick-file-grace.txt')).toBeVisible()
      await search.fill('ada@example.test')
      await expect(options).toHaveCount(2)
      await expect(commits).toHaveValue(latestHash)
      await commits.selectOption(adaHash)
      await search.fill('')
      await expect(options).toHaveCount(4)
      await expect(commits).toHaveValue(adaHash)
      await search.fill('no such commit is loaded')
      await expect(page.getByRole('status')).toHaveText('No commits match your search')
      await expect(commits).toHaveCount(0)
      await expect(page.getByTestId('cherry-pick-action-btn')).toBeDisabled()
      await expect(page.getByTestId('cherry-pick-file-ada.txt')).toHaveCount(0)
      await search.fill('')
      await expect(options).toHaveCount(4)
      await expect(commits).toHaveValue(adaHash)
      await search.fill('checkout')
      await page.getByTestId('cherry-pick-modal-close').click()
      await page.getByTestId('cherry-pick-btn').click()
      await expect(search).toHaveValue('')
      await expect(options).toHaveCount(4)
    } finally { await app.close() }
  })

  test('cherry-picks the filtered commit rather than the previously selected hidden commit', async () => {
    const { app, page } = await openPicker()
    try {
      const commits = page.getByTestId('cherry-pick-commit-select')
      await expect(commits).toHaveValue(latestHash)
      await page.getByRole('searchbox', { name: 'Filter commits', exact: true }).fill('journey IDs')
      await expect(commits).toHaveValue(adaHash)
      await expect(page.getByTestId('cherry-pick-file-ada.txt')).toBeVisible()
      await page.getByTestId('cherry-pick-action-btn').click()
      await expect(commits).toBeHidden()
      await expect.poll(() => fs.existsSync(path.join(sandbox.dir, 'ada.txt'))).toBe(true)
      expect(fs.readFileSync(path.join(sandbox.dir, 'ada.txt'), 'utf8')).toBe('Ada change\n')
      expect(fs.existsSync(path.join(sandbox.dir, 'grace.txt'))).toBe(false)
      expect(fs.existsSync(path.join(sandbox.dir, 'docs.txt'))).toBe(false)
      expect((await sandbox.git.log()).latest?.message).toBe('Fix journey IDs [BE-12388]')
    } finally { await app.close() }
  })
})
