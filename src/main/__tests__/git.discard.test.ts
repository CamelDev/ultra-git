import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import simpleGit from 'simple-git'
import { gitService } from '../git'

describe('Git Service Discard Changes Tests', () => {
  let tmpDir: string
  const baseTestDir = path.join(process.cwd(), '.tmp-test-git-discard')

  beforeEach(async () => {
    if (!fs.existsSync(baseTestDir)) {
      fs.mkdirSync(baseTestDir, { recursive: true })
    }
    tmpDir = fs.mkdtempSync(path.join(baseTestDir, 'test-'))
    const git = simpleGit(tmpDir)
    await git.init()
    await git.addConfig('user.name', 'Test User')
    await git.addConfig('user.email', 'test@example.com')
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('Discard single unstaged untracked file', async () => {
    const filePath = 'untracked.txt'
    const fullPath = path.join(tmpDir, filePath)
    fs.writeFileSync(fullPath, 'hello untracked')

    expect(fs.existsSync(fullPath)).toBe(true)

    await gitService.discardChanges(tmpDir, filePath, false)

    expect(fs.existsSync(fullPath)).toBe(false)
  })

  test('Discard multiple unstaged untracked files', async () => {
    const files = ['file1.txt', 'file2.txt', 'file3.txt']
    for (const f of files) {
      fs.writeFileSync(path.join(tmpDir, f), `content ${f}`)
    }

    await gitService.discardChanges(tmpDir, files, false)

    for (const f of files) {
      expect(fs.existsSync(path.join(tmpDir, f))).toBe(false)
    }
  })

  test('Discard single unstaged tracked modification', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'tracked.txt'
    const fullPath = path.join(tmpDir, filePath)

    // Initial commit
    fs.writeFileSync(fullPath, 'initial content\n')
    await git.add(filePath)
    await git.commit('initial')

    // Modify file
    fs.writeFileSync(fullPath, 'modified content\n')

    await gitService.discardChanges(tmpDir, filePath, false)

    const restored = fs.readFileSync(fullPath, 'utf8')
    expect(restored).toBe('initial content\n')
  })

  test('Discard multiple unstaged tracked modifications and deletions', async () => {
    const git = simpleGit(tmpDir)
    const fileA = 'a.txt'
    const fileB = 'b.txt'
    const fullPathA = path.join(tmpDir, fileA)
    const fullPathB = path.join(tmpDir, fileB)

    // Initial commit
    fs.writeFileSync(fullPathA, 'content A\n')
    fs.writeFileSync(fullPathB, 'content B\n')
    await git.add([fileA, fileB])
    await git.commit('initial')

    // Modify A and delete B
    fs.writeFileSync(fullPathA, 'content A modified\n')
    fs.unlinkSync(fullPathB)

    await gitService.discardChanges(tmpDir, [fileA, fileB], false)

    expect(fs.readFileSync(fullPathA, 'utf8')).toBe('content A\n')
    expect(fs.existsSync(fullPathB)).toBe(true)
    expect(fs.readFileSync(fullPathB, 'utf8')).toBe('content B\n')
  })

  test('Discard single staged tracked modification', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'staged_tracked.txt'
    const fullPath = path.join(tmpDir, filePath)

    // Initial commit
    fs.writeFileSync(fullPath, 'version 1\n')
    await git.add(filePath)
    await git.commit('initial')

    // Modify and stage
    fs.writeFileSync(fullPath, 'version 2\n')
    await git.add(filePath)

    await gitService.discardChanges(tmpDir, filePath, true)

    expect(fs.readFileSync(fullPath, 'utf8')).toBe('version 1\n')
    const status = await git.status()
    expect(status.staged.length).toBe(0)
    expect(status.modified.length).toBe(0)
  })

  test('Discard single staged new file (not in HEAD)', async () => {
    const git = simpleGit(tmpDir)
    // Create initial commit so HEAD exists
    const initFile = 'init.txt'
    fs.writeFileSync(path.join(tmpDir, initFile), 'init\n')
    await git.add(initFile)
    await git.commit('initial')

    // Create new file and stage it
    const newFile = 'brand_new.txt'
    const fullPath = path.join(tmpDir, newFile)
    fs.writeFileSync(fullPath, 'brand new content\n')
    await git.add(newFile)

    await gitService.discardChanges(tmpDir, newFile, true)

    expect(fs.existsSync(fullPath)).toBe(false)
    const status = await git.status()
    expect(status.files.length).toBe(0)
  })

  test('Discard multiple staged new files and staged modifications', async () => {
    const git = simpleGit(tmpDir)
    const file1 = 'existing.txt'
    fs.writeFileSync(path.join(tmpDir, file1), 'existing initial\n')
    await git.add(file1)
    await git.commit('initial')

    // Modify existing file and stage it
    fs.writeFileSync(path.join(tmpDir, file1), 'existing modified\n')
    await git.add(file1)

    // Create 2 new files and stage them
    const newFile1 = 'new1.txt'
    const newFile2 = 'new2.txt'
    fs.writeFileSync(path.join(tmpDir, newFile1), 'new1 content\n')
    fs.writeFileSync(path.join(tmpDir, newFile2), 'new2 content\n')
    await git.add([newFile1, newFile2])

    // Discard all 3 staged files at once
    await gitService.discardChanges(tmpDir, [file1, newFile1, newFile2], true)

    expect(fs.readFileSync(path.join(tmpDir, file1), 'utf8')).toBe('existing initial\n')
    expect(fs.existsSync(path.join(tmpDir, newFile1))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, newFile2))).toBe(false)

    const status = await git.status()
    expect(status.files.length).toBe(0)
  })
})
