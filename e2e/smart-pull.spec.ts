import { test, expect } from '@playwright/test'
import { launchElectronApp, addRepoViaUI, LaunchedApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import path from 'path'
import fs from 'fs'

/**
 * Smart Pull E2E tests — see docs/smart-pull-design.md, section 6.
 * Covers the uncommitted-changes state matrix: overlap (stash-pull-reapply),
 * untracked collisions, safe dirty trees, stash-pop conflicts, merge-conflict
 * abort, and the rebase integration strategy.
 */
test.describe('Smart Pull', () => {
  let localSandbox: GitSandbox
  let remoteSandbox: GitSandbox

  test.beforeEach(async () => {
    // Remote repository acting as upstream
    remoteSandbox = new GitSandbox()
    await remoteSandbox.init()
    await remoteSandbox.git.branch(['-M', 'main'])

    // Local repository cloned from the remote sandbox
    localSandbox = new GitSandbox()
    fs.rmSync(localSandbox.dir, { recursive: true, force: true })
    const baseGit = require('simple-git')()
    await baseGit.clone(remoteSandbox.dir, localSandbox.dir)
    await localSandbox.git.addConfig('user.name', 'Test User', false, 'local')
    await localSandbox.git.addConfig('user.email', 'test@example.com', false, 'local')

    // Allow pushing to the checked-out branch on the remote sandbox
    await remoteSandbox.git.addConfig('receive.denyCurrentBranch', 'ignore', false, 'local')
  })

  test.afterEach(async () => {
    await localSandbox.destroy()
    await remoteSandbox.destroy()
  })

  async function openRepoInApp(app: LaunchedApp['app'], page: LaunchedApp['page']) {
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    await app.evaluate(async ({ ipcMain }, sandboxPath) => {
      ipcMain.removeHandler('dialog:openDirectory')
      ipcMain.handle('dialog:openDirectory', async () => {
        return { canceled: false, path: sandboxPath }
      })
    }, localSandbox.dir)

    await addRepoViaUI(page)

    const tabs = page.locator('[data-testid="repo-tab"]')
    await expect(tabs).toHaveCount(2)
    await tabs.last().click()
    await page.waitForTimeout(1000)
  }

  async function clickPullAndConfirm(page: LaunchedApp['page']) {
    await page.locator('[data-testid="pull-btn"]').click()
    const pullDialog = page.locator('[data-testid="pull-custom-dialog"]')
    await expect(pullDialog).toBeVisible()
    await expect(pullDialog).toContainText('Pull Changes')
    const confirmBtn = page.locator('[data-testid="pull-custom-dialog-action-pull"]')
    await expect(confirmBtn).toBeVisible()
    await confirmBtn.click()
  }

  test('stashes, pulls and re-applies overlapping uncommitted changes', async () => {
    // Shared tracked file on both sides
    await localSandbox.createCommit('shared.txt', 'line one\nline two\nline three\n', 'Add shared file')
    await localSandbox.git.push('origin', 'main')
    // Remote edits line 3 (local becomes behind by 1)
    await remoteSandbox.createCommit('shared.txt', 'line one\nline two\nline three remote\n', 'Remote updates shared')
    await localSandbox.git.fetch()
    // Local UNCOMMITTED edit on the same file but a DIFFERENT line (no conflict)
    fs.writeFileSync(path.join(localSandbox.dir, 'shared.txt'), 'line one local\nline two\nline three\n')

    const { app, page } = await launchElectronApp()
    try {
      await openRepoInApp(app, page)

      await page.locator('[data-testid="pull-btn"]').click()

      // Overlap warning lists the colliding file; stash mode is pre-selected
      const pullDialog = page.locator('[data-testid="pull-custom-dialog"]')
      await expect(pullDialog).toBeVisible()
      const warning = page.locator('[data-testid="pull-overlap-warning"]')
      await expect(warning).toBeVisible()
      await expect(warning).toContainText('shared.txt')
      await expect(page.locator('[data-testid="pull-mode-stash-card"]')).toBeVisible()

      const confirmBtn = page.locator('[data-testid="pull-custom-dialog-action-pull"]')
      await confirmBtn.click()
      await expect(page.locator('[data-testid="pull-btn"]')).toBeEnabled({ timeout: 15000 })

      // Behind badge is gone
      await expect(page.locator('[data-testid="pull-behind-count"]')).not.toBeVisible()

      // File contains both the pulled line and the re-applied local edit
      const content = fs.readFileSync(path.join(localSandbox.dir, 'shared.txt'), 'utf8')
      expect(content).toContain('line three remote')
      expect(content).toContain('line one local')

      // Auto-stash was popped cleanly — nothing left behind
      const stashList = await localSandbox.git.raw(['stash', 'list'])
      expect(stashList.trim()).toBe('')
    } finally {
      await app.close()
    }
  })

  test('pulls directly when uncommitted changes do not overlap', async () => {
    await remoteSandbox.createCommit('remote-file.txt', 'remote content\n', 'Remote adds file')
    await localSandbox.git.fetch()
    // Local untracked scratch file that does not collide
    fs.writeFileSync(path.join(localSandbox.dir, 'local-scratch.txt'), 'uncommitted local notes\n')

    const { app, page } = await launchElectronApp()
    try {
      await openRepoInApp(app, page)
      await clickPullAndConfirm(page)
      await expect(page.locator('[data-testid="pull-btn"]')).toBeEnabled({ timeout: 15000 })

      // No overlap warning was shown, the safe-dirty note was shown instead
      // (asserted before confirming via the dialog; dialog already closed here)
      expect(fs.readFileSync(path.join(localSandbox.dir, 'local-scratch.txt'), 'utf8')).toContain('uncommitted local notes')
      expect(fs.existsSync(path.join(localSandbox.dir, 'remote-file.txt'))).toBe(true)

      const stashList = await localSandbox.git.raw(['stash', 'list'])
      expect(stashList.trim()).toBe('')
    } finally {
      await app.close()
    }
  })

  test('shows the safe-dirty note instead of a warning when nothing overlaps', async () => {
    await remoteSandbox.createCommit('remote-file.txt', 'remote content\n', 'Remote adds file')
    await localSandbox.git.fetch()
    fs.writeFileSync(path.join(localSandbox.dir, 'local-scratch.txt'), 'uncommitted local notes\n')

    const { app, page } = await launchElectronApp()
    try {
      await openRepoInApp(app, page)

      await page.locator('[data-testid="pull-btn"]').click()
      const pullDialog = page.locator('[data-testid="pull-custom-dialog"]')
      await expect(pullDialog).toBeVisible()
      await expect(page.locator('[data-testid="pull-overlap-warning"]')).not.toBeVisible()
      await expect(page.locator('[data-testid="pull-safe-dirty-note"]')).toBeVisible()

      await page.locator('[data-testid="pull-custom-dialog-action-pull"]').click()
      await expect(page.locator('[data-testid="pull-btn"]')).toBeEnabled({ timeout: 15000 })
    } finally {
      await app.close()
    }
  })

  test('reports stash-pop conflicts and keeps the stash', async () => {
    await localSandbox.createCommit('shared.txt', 'line1\nline2\nline3\n', 'Add shared')
    await localSandbox.git.push('origin', 'main')
    // Remote edits line 2
    await remoteSandbox.createCommit('shared.txt', 'line1\nline2 remote\nline3\n', 'Remote edits line2')
    await localSandbox.git.fetch()
    // Local UNCOMMITTED edit on the SAME line
    fs.writeFileSync(path.join(localSandbox.dir, 'shared.txt'), 'line1\nline2 local\nline3\n')

    const { app, page } = await launchElectronApp()
    try {
      await openRepoInApp(app, page)
      await clickPullAndConfirm(page)

      // Pull itself succeeded, but re-applying the stash conflicts
      const resultDialog = page.locator('[data-testid="pull-result-dialog"]')
      await expect(resultDialog).toBeVisible({ timeout: 15000 })
      await expect(resultDialog).toContainText('Changes Re-applied With Conflicts')
      // dispatchEvent: an inline <pre> conflict preview may overlay the button
      await page.locator('[data-testid="pull-result-dialog-action-later"]').dispatchEvent('click')

      // Stash is retained with the identifiable auto-stash message
      const stashList = await localSandbox.git.raw(['stash', 'list'])
      expect(stashList).toContain('ultra-git: auto-stash before pull')

      // Working tree carries conflict markers
      const content = fs.readFileSync(path.join(localSandbox.dir, 'shared.txt'), 'utf8')
      expect(content).toContain('<<<<<<<')

      // Conflict banner is visible in the UI
      await expect(page.locator('[data-testid="pull-conflict-banner"]')).toBeVisible()
    } finally {
      await app.close()
    }
  })

  test('can abort a conflicted pull and roll back to the pre-pull state', async () => {
    // Both sides commit conflicting versions of the same file (clean trees)
    await localSandbox.createCommit('conflict.txt', 'local version\n', 'Local conflicting commit')
    await remoteSandbox.createCommit('conflict.txt', 'remote version\n', 'Remote conflicting commit')
    await localSandbox.git.fetch()
    const headBefore = (await localSandbox.git.revparse(['HEAD'])).trim()

    const { app, page } = await launchElectronApp()
    try {
      await openRepoInApp(app, page)
      await clickPullAndConfirm(page)

      // Merge conflict dialog offers Resolve / Abort / Later
      const resultDialog = page.locator('[data-testid="pull-result-dialog"]')
      await expect(resultDialog).toBeVisible({ timeout: 15000 })
      await expect(resultDialog).toContainText('Merge Conflicts Detected')
      const abortBtn = page.locator('[data-testid="pull-result-dialog-action-abort"]')
      await expect(abortBtn).toBeVisible()
      // dispatchEvent: an inline <pre> conflict preview may overlay the button
      await abortBtn.dispatchEvent('click')
      await page.waitForTimeout(1000)

      // Rolled back: HEAD unchanged, working tree clean, no MERGE_HEAD
      const headAfter = (await localSandbox.git.revparse(['HEAD'])).trim()
      expect(headAfter).toBe(headBefore)
      const status = await localSandbox.git.status()
      expect(status.files.length).toBe(0)
      expect(fs.existsSync(path.join(localSandbox.dir, '.git', 'MERGE_HEAD'))).toBe(false)
    } finally {
      await app.close()
    }
  })

  test('handles untracked files colliding with incoming files', async () => {
    // Remote commits a brand-new file
    await remoteSandbox.createCommit('new-shared.txt', 'remote committed version\n', 'Remote adds file')
    await localSandbox.git.fetch()
    // Local has an UNTRACKED file at the same path
    fs.writeFileSync(path.join(localSandbox.dir, 'new-shared.txt'), 'my local untracked version\n')

    const { app, page } = await launchElectronApp()
    try {
      await openRepoInApp(app, page)

      await page.locator('[data-testid="pull-btn"]').click()
      const warning = page.locator('[data-testid="pull-overlap-warning"]')
      await expect(warning).toBeVisible()
      await expect(warning).toContainText('new-shared.txt')

      // Include-untracked is forced on (collision makes it mandatory)
      const untrackedCheckbox = page.locator('[data-testid="pull-include-untracked-checkbox"]')
      await expect(untrackedCheckbox).toBeChecked()
      await expect(untrackedCheckbox).toBeDisabled()

      await page.locator('[data-testid="pull-custom-dialog-action-pull"]').click()

      // The untracked file cannot be restored on top of the committed one —
      // the re-apply dialog appears and the stash is retained for manual recovery
      const resultDialog = page.locator('[data-testid="pull-result-dialog"]')
      await expect(resultDialog).toBeVisible({ timeout: 15000 })
      await expect(resultDialog).toContainText('Changes Re-applied With Conflicts')
      // dispatchEvent: an inline <pre> conflict preview may overlay the button
      await page.locator('[data-testid="pull-result-dialog-action-later"]').dispatchEvent('click')

      const stashList = await localSandbox.git.raw(['stash', 'list'])
      expect(stashList).toContain('ultra-git: auto-stash before pull')

      // Behind badge is gone — the pull itself succeeded
      await expect(page.locator('[data-testid="pull-behind-count"]')).not.toBeVisible()
    } finally {
      await app.close()
    }
  })

  test('supports the rebase strategy for diverged branches', async () => {
    await localSandbox.createCommit('local.txt', 'local\n', 'Local commit')
    await remoteSandbox.createCommit('remote.txt', 'remote\n', 'Remote commit')
    await localSandbox.git.fetch()

    const { app, page } = await launchElectronApp()
    try {
      await openRepoInApp(app, page)

      await page.locator('[data-testid="pull-btn"]').click()
      // Diverged → strategy section is visible; choose rebase
      await expect(page.locator('[data-testid="pull-strategy-section"]')).toBeVisible()
      await page.locator('[data-testid="pull-strategy-rebase"]').check()

      await page.locator('[data-testid="pull-custom-dialog-action-pull"]').click()
      await expect(page.locator('[data-testid="pull-btn"]')).toBeEnabled({ timeout: 15000 })

      // Behind badge gone
      await expect(page.locator('[data-testid="pull-behind-count"]')).not.toBeVisible()

      // Linear history: HEAD is the local commit with a single parent = remote commit
      const parentsRaw = (await localSandbox.git.raw(['rev-list', '--parents', '-n', '1', 'HEAD'])).trim().split(/\s+/)
      expect(parentsRaw.length).toBe(2) // hash + exactly one parent (no merge commit)
      const headMsg = (await localSandbox.git.raw(['log', '-1', '--format=%s', 'HEAD'])).trim()
      const parentMsg = (await localSandbox.git.raw(['log', '-1', '--format=%s', 'HEAD~1'])).trim()
      expect(headMsg).toBe('Local commit')
      expect(parentMsg).toBe('Remote commit')
    } finally {
      await app.close()
    }
  })
})
