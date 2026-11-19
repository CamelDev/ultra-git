import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { simpleGit } from 'simple-git'
import { gitService, parseFileHistoryOutput, clearGitInstances } from '../git'

describe('parseFileHistoryOutput', () => {
  it('returns empty array for empty or whitespace input', () => {
    expect(parseFileHistoryOutput('', 'src/app.ts')).toEqual([])
    expect(parseFileHistoryOutput('   \n\n  ', 'src/app.ts')).toEqual([])
  })

  it('parses modifications, additions, deletions, and renames with spaces', () => {
    const raw = [
      '\x1eaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\x1fAlice\x1falice@example.com\x1f2026-01-03T10:00:00+00:00\x1fUpdate greeting\x1f\n\nM\tsrc/my file.ts\n',
      '\x1ebbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\x1fBob\x1fbob@example.com\x1f2026-01-02T09:00:00+00:00\x1fRename file\x1f\n\nR100\tsrc/old file.ts\tsrc/my file.ts\n',
      '\x1ecccccccccccccccccccccccccccccccccccccccc\x1fAlice\x1falice@example.com\x1f2026-01-01T08:00:00+00:00\x1fAdd initial file\x1f\n\nA\tsrc/old file.ts\n'
    ].join('')

    const entries = parseFileHistoryOutput(raw, 'src/my file.ts')
    expect(entries).toHaveLength(3)

    expect(entries[0]).toEqual({
      hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      authorName: 'Alice',
      authorEmail: 'alice@example.com',
      date: '2026-01-03T10:00:00+00:00',
      message: 'Update greeting',
      status: 'M',
      filePath: 'src/my file.ts'
    })

    expect(entries[1]).toEqual({
      hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      authorName: 'Bob',
      authorEmail: 'bob@example.com',
      date: '2026-01-02T09:00:00+00:00',
      message: 'Rename file',
      status: 'R',
      filePath: 'src/my file.ts',
      oldPath: 'src/old file.ts'
    })

    expect(entries[2]).toEqual({
      hash: 'cccccccccccccccccccccccccccccccccccccccc',
      authorName: 'Alice',
      authorEmail: 'alice@example.com',
      date: '2026-01-01T08:00:00+00:00',
      message: 'Add initial file',
      status: 'A',
      filePath: 'src/old file.ts'
    })
  })

  it('falls back to requested filePath and status M when name-status line is missing', () => {
    const raw = '\x1edddddddddddddddddddddddddddddddddddddddd\x1fCarol\x1fcarol@example.com\x1f2026-01-04T12:00:00+00:00\x1fMerge branch\x1f\n'
    const entries = parseFileHistoryOutput(raw, 'src\\nested\\file.ts')
    expect(entries).toHaveLength(1)
    expect(entries[0].filePath).toBe('src/nested/file.ts')
    expect(entries[0].status).toBe('M')
  })
})

describe('gitService.getFileHistory integration', () => {
  let tempDir: string

  beforeEach(async () => {
    clearGitInstances()
    const baseDir = path.join(process.cwd(), 'test-results')
    fs.mkdirSync(baseDir, { recursive: true })
    tempDir = fs.mkdtempSync(path.join(baseDir, 'file-history-'))
    const git = simpleGit(tempDir)
    await git.init()
    await git.addConfig('user.name', 'Alice', false, 'local')
    await git.addConfig('user.email', 'alice@example.com', false, 'local')

    fs.writeFileSync(path.join(tempDir, 'old-name.ts'), 'export const v = 1\n')
    await git.add('old-name.ts')
    await git.commit('Initial commit of old-name')

    fs.writeFileSync(path.join(tempDir, 'other.txt'), 'unrelated\n')
    await git.add('other.txt')
    await git.commit('Unrelated commit')

    await git.addConfig('user.name', 'Bob', false, 'local')
    await git.addConfig('user.email', 'bob@example.com', false, 'local')
    fs.renameSync(path.join(tempDir, 'old-name.ts'), path.join(tempDir, 'new-name.ts'))
    await git.add(['-A'])
    await git.commit('Rename old-name to new-name')

    fs.writeFileSync(path.join(tempDir, 'new-name.ts'), 'export const v = 2\n')
    await git.add('new-name.ts')
    await git.commit('Update v to 2')
  })

  afterEach(() => {
    clearGitInstances()
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      } catch {
        // Windows may briefly hold git object handles
      }
    }
  })

  it('returns file history following renames and excluding unrelated commits', async () => {
    const history = await gitService.getFileHistory(tempDir, 'new-name.ts')
    expect(history).toHaveLength(3)

    expect(history[0].message).toBe('Update v to 2')
    expect(history[0].authorName).toBe('Bob')
    expect(history[0].status).toBe('M')
    expect(history[0].filePath).toBe('new-name.ts')

    expect(history[1].message).toBe('Rename old-name to new-name')
    expect(history[1].authorName).toBe('Bob')
    expect(history[1].status).toBe('R')
    expect(history[1].oldPath).toBe('old-name.ts')
    expect(history[1].filePath).toBe('new-name.ts')

    expect(history[2].message).toBe('Initial commit of old-name')
    expect(history[2].authorName).toBe('Alice')
    expect(history[2].status).toBe('A')
    expect(history[2].filePath).toBe('old-name.ts')
  })

  it('respects maxCount parameter', async () => {
    const history = await gitService.getFileHistory(tempDir, 'new-name.ts', 2)
    expect(history).toHaveLength(2)
    expect(history[0].message).toBe('Update v to 2')
    expect(history[1].message).toBe('Rename old-name to new-name')
  })

  it('returns empty array for untracked or non-existent files', async () => {
    fs.writeFileSync(path.join(tempDir, 'untracked.ts'), 'hello\n')
    const history = await gitService.getFileHistory(tempDir, 'untracked.ts')
    expect(history).toEqual([])
  })
})
