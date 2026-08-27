import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import simpleGit from 'simple-git'
import { gitService } from '../git'

describe('Git Service Undo & Safety Snapshot Tests', () => {
  let tmpDir: string
  const baseTestDir = path.join(process.cwd(), '.tmp-test-git-undo')

  beforeEach(async () => {
    if (!fs.existsSync(baseTestDir)) {
      fs.mkdirSync(baseTestDir, { recursive: true })
    }
    tmpDir = fs.mkdtempSync(path.join(baseTestDir, 'test-'))
    const git = simpleGit(tmpDir)
    await git.init()
    await git.addConfig('user.name', 'Test User')
    await git.addConfig('user.email', 'test@example.com')
    await git.addConfig('core.autocrlf', 'false')
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('undoCommit correctly soft-resets standard commit', async () => {
    const git = simpleGit(tmpDir)
    const file1 = path.join(tmpDir, 'file1.txt')
    fs.writeFileSync(file1, 'initial')
    await git.add('file1.txt')
    await git.commit('first commit')

    const file2 = path.join(tmpDir, 'file2.txt')
    fs.writeFileSync(file2, 'second')
    await git.add('file2.txt')
    await git.commit('second commit')

    const logBefore = await git.log()
    expect(logBefore.total).toBe(2)

    const res = await gitService.undoCommit(tmpDir)
    expect(res.success).toBe(true)

    const logAfter = await git.log()
    expect(logAfter.total).toBe(1)
    expect(logAfter.latest?.message).toBe('first commit')

    const status = await git.status()
    expect(status.staged).toContain('file2.txt')
  })

  test('undoCommit handles root commit', async () => {
    const git = simpleGit(tmpDir)
    const file1 = path.join(tmpDir, 'file1.txt')
    fs.writeFileSync(file1, 'initial')
    await git.add('file1.txt')
    await git.commit('root commit')

    const res = await gitService.undoCommit(tmpDir)
    expect(res.success).toBe(true)

    const status = await git.status()
    expect(status.staged).toContain('file1.txt')
  })

  test('createSafetySnapshot and restoreSafetySnapshot for modified and untracked files', async () => {
    const git = simpleGit(tmpDir)
    const tracked = path.join(tmpDir, 'tracked.txt')
    fs.writeFileSync(tracked, 'v1')
    await git.add('tracked.txt')
    await git.commit('init')

    // Modify tracked and add untracked
    fs.writeFileSync(tracked, 'v2-modified')
    const untracked = path.join(tmpDir, 'untracked.txt')
    fs.writeFileSync(untracked, 'untracked-content')

    const snapRes = await gitService.createSafetySnapshot(tmpDir, ['tracked.txt', 'untracked.txt'])
    expect(snapRes.success).toBe(true)
    expect(snapRes.snapshotId).toBeDefined()

    // Now discard or wipe changes
    fs.writeFileSync(tracked, 'v1')
    fs.rmSync(untracked)

    expect(fs.readFileSync(tracked, 'utf8')).toBe('v1')
    expect(fs.existsSync(untracked)).toBe(false)

    // Restore from snapshot
    const restoreRes = await gitService.restoreSafetySnapshot(tmpDir, snapRes.snapshotId!)
    expect(restoreRes.success).toBe(true)

    expect(fs.readFileSync(tracked, 'utf8')).toBe('v2-modified')
    expect(fs.existsSync(untracked)).toBe(true)
    expect(fs.readFileSync(untracked, 'utf8')).toBe('untracked-content')

    // Delete snapshot
    const delRes = await gitService.deleteSafetySnapshot(tmpDir, snapRes.snapshotId!)
    expect(delRes.success).toBe(true)
  })
})
