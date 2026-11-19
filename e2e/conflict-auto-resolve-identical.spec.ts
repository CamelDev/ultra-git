import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'

const targetFile = 'shared-and-conflict.txt'

async function createIdenticalAndConflictSandbox(): Promise<GitSandbox> {
  const sandbox = new GitSandbox()
  await sandbox.init()
  await sandbox.git.branch(['-M', 'main'])
  await sandbox.git.addConfig('user.name', 'Test User', false, 'local')
  await sandbox.git.addConfig('user.email', 'test@example.com', false, 'local')

  const base = [
    'line 1',
    'shared-base',
    'line 3',
    'line 4',
    'line 5',
    'real-base',
    'line 7',
    ''
  ].join('\n')

  const incoming = [
    'line 1',
    'shared-same-fix',
    'line 3',
    'line 4',
    'line 5',
    'incoming-conflict',
    'line 7',
    ''
  ].join('\n')

  const current = [
    'line 1',
    'shared-same-fix',
    'line 3',
    'line 4',
    'line 5',
    'current-conflict',
    'line 7',
    ''
  ].join('\n')

  await sandbox.createCommit(targetFile, base, 'Base commit')

  await sandbox.createBranch('feature/identical-and-conflict')
  await sandbox.createCommit(targetFile, incoming, 'Feature changes')

  await sandbox.checkoutBranch('main')
  await sandbox.createCommit(targetFile, current, 'Main changes')

  await sandbox.git.merge(['feature/identical-and-conflict']).catch(() => {})
  expect((await sandbox.git.status()).conflicted).toContain(targetFile)
  return sandbox
}

test('auto-resolves identical changes on both sides with a green tick while keeping them visible', async () => {
  const sandbox = await createIdenticalAndConflictSandbox()
  const { app, page } = await launchElectronApp({ disableDefaultTab: true })

  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1400, 900))
    await app.evaluate(({ ipcMain }, repoPath) => {
      ipcMain.removeHandler('dialog:openDirectory')
      ipcMain.handle('dialog:openDirectory', () => ({ canceled: false, path: repoPath }))
    }, sandbox.dir)

    await addRepoViaUI(page)
    const resolver = page.getByTestId('conflict-resolver')
    await expect(resolver).toBeVisible()

    // Both regions remain visible in the tablist
    const regionTabs = resolver.locator('[role="tablist"] [role="tab"]')
    await expect(regionTabs).toHaveCount(2)

    // Region 1 (identical on both sides) is already marked resolved with a green tick
    await expect(regionTabs.nth(0)).toHaveClass(/resolved/)
    await expect(regionTabs.nth(0)).toHaveAttribute('aria-label', /auto-resolved/)

    // Focus starts on Region 2 (the first unresolved conflict), with only 1 remaining
    await expect(regionTabs.nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(regionTabs.nth(1)).not.toHaveClass(/resolved/)
    await expect(resolver.locator('.conflict-count-badge')).toHaveText('1 remaining')

    // Inspecting Region 1 shows the auto-resolved indicator and Use Current already selected
    await regionTabs.nth(0).click()
    await expect(resolver.getByTestId('conflict-auto-resolved-badge')).toBeVisible()
    await expect(resolver.getByTestId('conflict-current')).toHaveAttribute('aria-pressed', 'true')

    // Resolve Region 2 with Incoming and verify both changes compose into Result and stage to disk
    await regionTabs.nth(1).click()
    await resolver.getByTestId('conflict-incoming').click()

    await expect(resolver.locator('.conflict-count-badge')).toHaveText('All conflicts resolved')
    const resultValue = await resolver.getByTestId('conflict-result-editor').inputValue()
    expect(resultValue).toContain('shared-same-fix')
    expect(resultValue).toContain('incoming-conflict')

    await resolver.getByTestId('conflict-apply-stage').click()
    await expect(resolver.getByTestId('conflict-continue-btn')).toBeEnabled()

    const stagedDisk = fs.readFileSync(path.join(sandbox.dir, targetFile), 'utf8')
    expect(stagedDisk).toContain('shared-same-fix')
    expect(stagedDisk).toContain('incoming-conflict')
  } finally {
    await app.close()
    await sandbox.destroy()
  }
})
