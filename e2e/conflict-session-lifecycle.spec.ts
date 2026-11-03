import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'

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

async function expectFinished(page: Page) {
  await expect(page.getByTestId('conflict-resolver')).toBeHidden()
  await expect.poll(() => page.evaluate(() => {
    const store = (window as any).useRepoStore.getState()
    const session = store.getConflictSession(store.activeId)
    return {
      phase: session.snapshot?.phase,
      activePath: session.activePath,
      draftCount: Object.keys(session.drafts).length,
      undo: session.undo,
      inProgress: store.getActiveRepo()?.mergeStatus?.inProgress
    }
  })).toEqual({ phase: 'completed', activePath: null, draftCount: 0, undo: null, inProgress: false })
  await expect(page.getByTestId('abort-merge-btn')).toHaveCount(0)
}

test.describe('Conflict operation lifecycle', () => {
  let sandbox: GitSandbox
  let originalHead: string

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])
    await sandbox.createCommit('conflict.txt', 'base\n', 'Base')
    await sandbox.createBranch('picked')
    await sandbox.createCommit('conflict.txt', 'incoming\n', 'Picked change')
    const picked = await sandbox.git.revparse(['HEAD'])
    await sandbox.checkoutBranch('main')
    await sandbox.createCommit('conflict.txt', 'current\n', 'Current change')
    originalHead = await sandbox.git.revparse(['HEAD'])
    await sandbox.git.raw(['cherry-pick', picked]).catch(() => {})
    expect((await sandbox.git.status()).conflicted).toEqual(['conflict.txt'])
  })

  test.afterEach(async () => { await sandbox.destroy() })

  test('closes when a cherry-pick completes outside the app with only Git metadata changing', async () => {
    const { app, page } = await openRepository(sandbox)
    try {
      const resolver = page.getByTestId('conflict-resolver')
      await resolver.getByTestId('conflict-incoming').click()
      await resolver.getByTestId('conflict-apply-stage').click()
      await expect(resolver.getByTestId('conflict-continue-btn')).toBeEnabled()

      // The file is already resolved and staged. Continue changes only .git metadata.
      await sandbox.git.raw(['-c', 'core.editor=true', 'cherry-pick', '--continue'])
      const committedHead = await sandbox.git.revparse(['HEAD'])
      expect(committedHead).not.toBe(originalHead)
      await expectFinished(page)
      expect(await sandbox.git.revparse(['HEAD'])).toBe(committedHead)
      expect(fs.readFileSync(path.join(sandbox.dir, 'conflict.txt'), 'utf8')).toBe('incoming\n')
      expect((await sandbox.git.status()).files).toHaveLength(0)
    } finally { await app.close() }
  })

  test('closes and clears the draft when the operation is aborted outside the app', async () => {
    const { app, page } = await openRepository(sandbox)
    try {
      const resolver = page.getByTestId('conflict-resolver')
      await resolver.getByTestId('conflict-result-editor').fill('local draft\n')
      await sandbox.git.raw(['cherry-pick', '--abort'])
      await expectFinished(page)
      expect(await sandbox.git.revparse(['HEAD'])).toBe(originalHead)
      expect(fs.readFileSync(path.join(sandbox.dir, 'conflict.txt'), 'utf8')).toBe('current\n')
    } finally { await app.close() }
  })

  test('dismisses a stale open request when Git already has no active operation', async () => {
    await sandbox.git.raw(['cherry-pick', '--abort'])
    const { app, page } = await openRepository(sandbox)
    try {
      await expect.poll(() => page.evaluate(() => (window as any).useRepoStore.getState().getActiveRepo()?.isLoading)).toBe(false)
      // Simulate the cached in-progress status that can outlive a completed Git command.
      await page.evaluate(() => {
        const store = (window as any).useRepoStore
        store.setState((state: any) => ({
          conflictSessions: {},
          repositories: state.repositories.map((repo: any) => repo.id === state.activeId ? {
            ...repo,
            mergeStatus: { isMerge: false, isRebase: false, isCherryPick: true, inProgress: true }
          } : repo)
        }))
      })
      await expectFinished(page)
      const staleAbort = await page.evaluate(repoPath => window.api.git.abortConflictOperation(repoPath), sandbox.dir)
      expect(staleAbort.success).toBe(true)
      expect(staleAbort.data.phase).toBe('completed')
      expect(await sandbox.git.revparse(['HEAD'])).toBe(originalHead)
    } finally { await app.close() }
  })
})
