import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import simpleGit from 'simple-git'
import { gitService } from '../git'

describe('Git Service Untrack & Gitignore Tests', () => {
  let tmpDir: string
  const baseTestDir = path.join(process.cwd(), '.tmp-test-git-untrack')

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

  test('untrack single tracked file without deleting from disk', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'tracked-file.txt'
    const fullPath = path.join(tmpDir, filePath)
    fs.writeFileSync(fullPath, 'hello content')

    // Commit the file initially
    await git.add(filePath)
    await git.commit('Initial commit')

    // Untrack the file
    await gitService.untrack(tmpDir, filePath)

    // File must still exist on disk
    expect(fs.existsSync(fullPath)).toBe(true)
    expect(fs.readFileSync(fullPath, 'utf-8')).toBe('hello content')

    // Git status should show the file is deleted in index ('D') and untracked in working dir ('?')
    const status = await gitService.status(tmpDir)
    const stagedFile = status.files.find((f) => f.path === filePath && f.index === 'D')
    expect(stagedFile).toBeDefined()

    const unstagedFile = status.files.find((f) => f.path === filePath && f.working_dir === '?')
    expect(unstagedFile).toBeDefined()
  })

  test('untrack multiple tracked files in directory', async () => {
    const git = simpleGit(tmpDir)
    const dir = path.join(tmpDir, '.run')
    fs.mkdirSync(dir, { recursive: true })
    const file1 = path.join(dir, 'app.run.xml')
    const file2 = path.join(dir, 'build.run.xml')
    fs.writeFileSync(file1, '<xml>app</xml>')
    fs.writeFileSync(file2, '<xml>build</xml>')

    await git.add(['.run/app.run.xml', '.run/build.run.xml'])
    await git.commit('Add run configs')

    await gitService.untrack(tmpDir, ['.run/app.run.xml', '.run/build.run.xml'])

    // Both files should remain intact on disk
    expect(fs.existsSync(file1)).toBe(true)
    expect(fs.existsSync(file2)).toBe(true)

    const status = await gitService.status(tmpDir)
    expect(status.files.some((f) => f.path === '.run/app.run.xml' && f.index === 'D')).toBe(true)
    expect(status.files.some((f) => f.path === '.run/build.run.xml' && f.index === 'D')).toBe(true)
  })

  test('addToGitignore creates file and avoids duplicate entries', async () => {
    const gitignorePath = path.join(tmpDir, '.gitignore')
    expect(fs.existsSync(gitignorePath)).toBe(false)

    // First addition creates file
    const res1 = await gitService.addToGitignore(tmpDir, '.run/')
    expect(res1.alreadyExisted).toBe(false)
    expect(fs.existsSync(gitignorePath)).toBe(true)
    expect(fs.readFileSync(gitignorePath, 'utf-8').trim()).toBe('.run/')

    // Second addition with same pattern does not duplicate
    const res2 = await gitService.addToGitignore(tmpDir, '.run/')
    expect(res2.alreadyExisted).toBe(true)
    const lines = fs.readFileSync(gitignorePath, 'utf-8').split(/\r?\n/).filter((l) => l.trim().length > 0)
    expect(lines).toEqual(['.run/'])

    // Adding a different pattern appends on a new line
    const res3 = await gitService.addToGitignore(tmpDir, '*.log')
    expect(res3.alreadyExisted).toBe(false)
    const updatedLines = fs.readFileSync(gitignorePath, 'utf-8').split(/\r?\n/).filter((l) => l.trim().length > 0)
    expect(updatedLines).toEqual(['.run/', '*.log'])
  })

  test('status correctly detects ignoredTrackedFiles', async () => {
    const git = simpleGit(tmpDir)
    const dir = path.join(tmpDir, '.run')
    fs.mkdirSync(dir, { recursive: true })
    const runFile = path.join(dir, 'test.xml')
    const regularFile = path.join(tmpDir, 'src.ts')

    fs.writeFileSync(runFile, '<xml>1</xml>')
    fs.writeFileSync(regularFile, 'console.log()')

    // Commit both files
    await git.add(['.run/test.xml', 'src.ts'])
    await git.commit('Initial files')

    // Now add .run/ to .gitignore
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.run/\n')

    // Modify both files
    fs.writeFileSync(runFile, '<xml>2</xml>')
    fs.writeFileSync(regularFile, 'console.log(2)')

    // Check status
    const status = await gitService.status(tmpDir)
    expect(status.ignoredTrackedFiles).toBeDefined()
    expect(status.ignoredTrackedFiles).toContain('.run/test.xml')
    expect(status.ignoredTrackedFiles).not.toContain('src.ts')
  })

  test('add throws structured error on ignored tracked file, but succeeds with force = true', async () => {
    const git = simpleGit(tmpDir)
    const dir = path.join(tmpDir, '.run')
    fs.mkdirSync(dir, { recursive: true })
    const runFile = path.join(dir, 'config.xml')

    fs.writeFileSync(runFile, '<config>old</config>')
    await git.add('.run/config.xml')
    await git.commit('Add run config')

    // Put .run/ in .gitignore
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.run/\n')

    // Modify run config
    fs.writeFileSync(runFile, '<config>new</config>')

    // Normal git add should throw structured error
    let thrownError: any = null
    try {
      await gitService.add(tmpDir, '.run/config.xml')
    } catch (err: any) {
      thrownError = err
    }

    expect(thrownError).not.toBeNull()
    expect(thrownError.isIgnoredTracked).toBe(true)
    expect(thrownError.files).toContain('.run/config.xml')

    // Force add should succeed
    await gitService.add(tmpDir, '.run/config.xml', true)

    const statusAfterForce = await gitService.status(tmpDir)
    expect(statusAfterForce.files.some((f) => f.path === '.run/config.xml' && f.index !== ' ')).toBe(true)
  })

  test('reset restores untracked index deletion (Undo support)', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'my-file.txt'
    const fullPath = path.join(tmpDir, filePath)
    fs.writeFileSync(fullPath, 'initial text')
    await git.add(filePath)
    await git.commit('Add my-file')

    // Untrack
    await gitService.untrack(tmpDir, filePath)
    let status = await gitService.status(tmpDir)
    expect(status.files.some((f) => f.path === filePath && f.index === 'D')).toBe(true)

    // Reset (Undo)
    await gitService.reset(tmpDir, [filePath])
    status = await gitService.status(tmpDir)
    // Should no longer be staged for deletion
    expect(status.files.some((f) => f.path === filePath && f.index === 'D')).toBe(false)
    expect(fs.existsSync(fullPath)).toBe(true)
  })
})
