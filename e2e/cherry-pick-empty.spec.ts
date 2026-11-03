import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'

async function startCherryPick(page: Page) {
  await page.getByTestId('cherry-pick-btn').click()
  await page.getByTestId('cherry-pick-branch-select').selectOption('picked')
  await expect(page.getByTestId('cherry-pick-file-conflict.txt')).toBeVisible()
  await page.getByTestId('cherry-pick-action-btn').click()
}

async function openRepository(sandbox: GitSandbox) {
  const launched = await launchElectronApp({ disableDefaultTab: true })
  await launched.app.evaluate(({ ipcMain }, repoPath) => {
    ipcMain.removeHandler('dialog:openDirectory')
    ipcMain.handle('dialog:openDirectory', () => ({ canceled: false, path: repoPath }))
  }, sandbox.dir)
  await addRepoViaUI(launched.page)
  await expect(launched.page.getByTestId('repo-tab')).toHaveCount(1)
  return launched
}

test.describe('Empty cherry-pick recovery', () => {
  let sandbox: GitSandbox
  let picked: string

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])
    await sandbox.createCommit('conflict.txt', 'base\n', 'Base')
    await sandbox.createBranch('picked')
    await sandbox.createCommit('conflict.txt', 'incoming\n', 'Change already merged elsewhere')
    picked = await sandbox.git.revparse(['HEAD'])
    await sandbox.checkoutBranch('main')
  })

  test.afterEach(async () => { await sandbox.destroy() })

  test('a redundant cherry-pick opens a decision screen and Skip completes without a new commit', async () => {
    await sandbox.createCommit('conflict.txt', 'incoming\n', 'Squashed copy of the picked change')
    const before = await sandbox.git.revparse(['HEAD'])
    const { app, page } = await openRepository(sandbox)
    try {
      await startCherryPick(page)
      const resolver = page.getByTestId('conflict-resolver')
      await expect(resolver.getByRole('heading', { name: 'Finish cherry-pick', exact: true })).toBeVisible()
      await expect(resolver.getByRole('heading', { name: 'No changes to apply', exact: true })).toBeVisible()
      await expect(resolver.getByTestId('conflict-continue-btn')).toHaveCount(0)
      await expect(resolver.getByRole('navigation', { name: 'Conflict files' })).toHaveCount(0)
      await expect(resolver.getByRole('alert')).toHaveCount(0)
      await expect(resolver.getByTestId('conflict-skip-btn')).toBeEnabled()

      // Even a stale client request returns the decision state rather than repeating Git's error.
      const staleContinue = await page.evaluate(repoPath => window.api.git.continueConflictOperation(repoPath), sandbox.dir)
      expect(staleContinue.success).toBe(true)
      expect(staleContinue.data.phase).toBe('empty')
      await page.screenshot({ path: 'test-results/cherry-pick-empty.png', animations: 'disabled' })
      await resolver.getByTestId('conflict-skip-btn').click()
      await expect(resolver).toBeHidden()
      expect(await sandbox.git.revparse(['HEAD'])).toBe(before)
      expect(fs.readFileSync(path.join(sandbox.dir, 'conflict.txt'), 'utf8')).toBe('incoming\n')
      expect(fs.existsSync(path.join(sandbox.dir, '.git', 'CHERRY_PICK_HEAD'))).toBe(false)
      expect((await sandbox.git.status()).files).toHaveLength(0)
    } finally { await app.close() }
  })

  test('keeping Current detects an empty result, supports Undo, and can then skip', async () => {
    await sandbox.createCommit('conflict.txt', 'current\n', 'Different change on main')
    const before = await sandbox.git.revparse(['HEAD'])
    const { app, page } = await openRepository(sandbox)
    try {
      await startCherryPick(page)
      const resolver = page.getByTestId('conflict-resolver')
      await resolver.getByTestId('conflict-current').click()
      await resolver.getByTestId('conflict-apply-stage').click()
      await expect(resolver.getByRole('heading', { name: 'No changes to apply', exact: true })).toBeVisible()
      await expect(resolver.getByTestId('conflict-continue-btn')).toHaveCount(0)
      await resolver.getByTestId('conflict-undo-resolution').click()
      await expect(resolver.getByTestId('conflict-current')).toBeVisible()
      await expect(resolver.getByTestId('conflict-apply-stage')).toBeDisabled()
      await resolver.getByTestId('conflict-current').click()
      await resolver.getByTestId('conflict-apply-stage').click()
      await resolver.getByTestId('conflict-skip-btn').click()
      await expect(resolver).toBeHidden()
      expect(await sandbox.git.revparse(['HEAD'])).toBe(before)
      expect(fs.readFileSync(path.join(sandbox.dir, 'conflict.txt'), 'utf8')).toBe('current\n')
      expect(fs.existsSync(path.join(sandbox.dir, '.git', 'CHERRY_PICK_HEAD'))).toBe(false)
    } finally { await app.close() }
  })

  test('reopening a repository recovers an empty cherry-pick even with no conflicted files', async () => {
    await sandbox.createCommit('conflict.txt', 'incoming\n', 'Squashed picked change')
    await sandbox.git.raw(['cherry-pick', picked]).catch(() => {})
    expect(fs.existsSync(path.join(sandbox.dir, '.git', 'CHERRY_PICK_HEAD'))).toBe(true)
    const { app, page } = await openRepository(sandbox)
    try {
      const resolver = page.getByTestId('conflict-resolver')
      await expect(resolver.getByRole('heading', { name: 'No changes to apply', exact: true })).toBeVisible()
      await page.reload()
      await expect(resolver.getByRole('heading', { name: 'No changes to apply', exact: true })).toBeVisible()
      await resolver.getByRole('button', { name: 'Abort', exact: true }).click()
      await expect(resolver).toBeHidden()
      expect(fs.existsSync(path.join(sandbox.dir, '.git', 'CHERRY_PICK_HEAD'))).toBe(false)
      expect(fs.readFileSync(path.join(sandbox.dir, 'conflict.txt'), 'utf8')).toBe('incoming\n')
    } finally { await app.close() }
  })

  test('unstaged edits prevent Skip and staging them restores Continue', async () => {
    await sandbox.createCommit('conflict.txt', 'incoming\n', 'Squashed picked change')
    await sandbox.git.raw(['cherry-pick', picked]).catch(() => {})
    fs.writeFileSync(path.join(sandbox.dir, 'conflict.txt'), 'manual resolution\n')
    const { app, page } = await openRepository(sandbox)
    try {
      const resolver = page.getByTestId('conflict-resolver')
      await expect(resolver.getByRole('heading', { name: 'Changes still need staging', exact: true })).toBeVisible()
      await expect(resolver.getByTestId('conflict-skip-btn')).toBeDisabled()
      await expect(resolver.getByTestId('conflict-continue-btn')).toHaveCount(0)
      expect(fs.readFileSync(path.join(sandbox.dir, 'conflict.txt'), 'utf8')).toBe('manual resolution\n')
      await sandbox.git.add('conflict.txt')
      await resolver.getByRole('button', { name: 'Refresh status', exact: true }).click()
      await expect(resolver.getByRole('heading', { name: 'Ready to continue', exact: true })).toBeVisible()
      await expect(resolver.getByTestId('conflict-continue-btn')).toBeEnabled()
      await resolver.getByTestId('conflict-continue-btn').click()
      await expect(resolver).toBeHidden()
      expect(fs.existsSync(path.join(sandbox.dir, '.git', 'CHERRY_PICK_HEAD'))).toBe(false)
      expect(await sandbox.git.show(['HEAD:conflict.txt'])).toBe('manual resolution\n')
    } finally { await app.close() }
  })
})
