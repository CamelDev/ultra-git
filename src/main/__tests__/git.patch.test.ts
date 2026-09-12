import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import { execFile } from 'child_process'
import simpleGit from 'simple-git'
import { gitService } from '../git'
import { buildHunksFromDiffItems, buildHunkPatch, computeDiff, DiffItem } from '../../renderer/src/utils/patchBuilder'

function applyPatchExecFile(repoPath: string, patch: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile('git', args, { cwd: repoPath }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message))
      } else {
        resolve(stdout)
      }
    })
    child.stdin?.write(patch)
    child.stdin?.end()
  })
}

describe('Git Patch Discard Tests', () => {
  let tmpDir: string
  const baseTestDir = path.join(process.cwd(), '.tmp-test-git-patch')

  beforeEach(async () => {
    if (!fs.existsSync(baseTestDir)) {
      fs.mkdirSync(baseTestDir, { recursive: true })
    }
    tmpDir = fs.mkdtempSync(path.join(baseTestDir, 'test-'))
    const git = simpleGit(tmpDir)
    await git.init()
    await git.addConfig('user.name', 'Test')
    await git.addConfig('user.email', 'test@example.com')
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('Discard hunk on modified tracked file (unstaged)', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'file.txt'
    const fullPath = path.join(tmpDir, filePath)

    // Initial commit
    fs.writeFileSync(fullPath, 'line 1\nline 2\nline 3\n')
    await git.add(filePath)
    await git.commit('initial')

    // Modify file
    fs.writeFileSync(fullPath, 'line 1\nline 2 modified\nline 3\n')

    // Compute diff
    const before = 'line 1\nline 2\nline 3'
    const after = 'line 1\nline 2 modified\nline 3'
    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(1)

    const patch = buildHunkPatch(filePath, hunks[0], 'discard')
    
    // Apply patch in reverse to discard
    await applyPatchExecFile(tmpDir, patch, ['apply', '--whitespace=nowarn', '--recount', '--reverse', '-'])

    const contentAfterDiscard = fs.readFileSync(fullPath, 'utf8')
    expect(contentAfterDiscard.trim()).toBe('line 1\nline 2\nline 3')
  })

  test('Discard hunk on staged file (isStaged = true)', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'stagedfile.txt'
    const fullPath = path.join(tmpDir, filePath)

    // Initial commit
    fs.writeFileSync(fullPath, 'line 1\nline 2\nline 3\n')
    await git.add(filePath)
    await git.commit('initial')

    // Modify file and stage it
    fs.writeFileSync(fullPath, 'line 1\nline 2 modified\nline 3\n')
    await git.add(filePath)

    // Staged diff: before is HEAD, after is Index
    const before = 'line 1\nline 2\nline 3'
    const after = 'line 1\nline 2 modified\nline 3'
    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    const patch = buildHunkPatch(filePath, hunks[0], 'unstage')

    // Step 1: unstage from index
    await applyPatchExecFile(tmpDir, patch, ['apply', '--whitespace=nowarn', '--recount', '--cached', '--reverse', '-'])

    // Step 2: discard from working tree
    await applyPatchExecFile(tmpDir, patch, ['apply', '--whitespace=nowarn', '--recount', '--reverse', '-'])

    const contentAfterDiscard = fs.readFileSync(fullPath, 'utf8')
    expect(contentAfterDiscard.trim()).toBe('line 1\nline 2\nline 3')
  })

  test('Discard hunk on untracked file (unstaged)', async () => {
    const filePath = 'untracked.txt'
    const fullPath = path.join(tmpDir, filePath)

    // Create untracked file
    fs.writeFileSync(fullPath, 'untracked line 1\nuntracked line 2\n')

    const before = ''
    const after = 'untracked line 1\nuntracked line 2'
    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(1)

    const patch = buildHunkPatch(filePath, hunks[0], 'discard')

    let error: any = null
    try {
      await applyPatchExecFile(tmpDir, patch, ['apply', '--whitespace=nowarn', '--recount', '--reverse', '-'])
    } catch (err) {
      error = err
    }

    console.log('Untracked file discard error:', error ? error.message : 'NONE')
  })

  test('Stage hunk on modified tracked file (single chunk)', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'single_chunk.txt'
    const fullPath = path.join(tmpDir, filePath)

    // Initial commit
    fs.writeFileSync(fullPath, 'line 1\nline 2\nline 3\n')
    await git.add(filePath)
    await git.commit('initial')

    // Modify line 2
    fs.writeFileSync(fullPath, 'line 1\nline 2 modified\nline 3\n')

    // Diff before and after
    const before = 'line 1\nline 2\nline 3'
    const after = 'line 1\nline 2 modified\nline 3'
    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(1)

    const patch = buildHunkPatch(filePath, hunks[0], 'stage')
    console.log('--- Patch for single modified chunk: ---\n', patch)

    await applyPatchExecFile(tmpDir, patch, ['apply', '--whitespace=nowarn', '--recount', '--cached', '-'])

    const indexContent = await git.show([`:${filePath}`])
    expect(indexContent.trim()).toBe('line 1\nline 2 modified\nline 3')
  })

  test('Stage hunk on untracked / new file (single chunk)', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'new_untracked_file.txt'
    const fullPath = path.join(tmpDir, filePath)

    // Create untracked file
    fs.writeFileSync(fullPath, 'new file content line 1\nnew file content line 2\n')

    const before = ''
    const after = 'new file content line 1\nnew file content line 2'
    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(1)
    console.log('Untracked hunk:', JSON.stringify(hunks[0]))

    const patch = buildHunkPatch(filePath, hunks[0], 'stage')
    console.log('--- Patch for untracked file: ---\n', patch)

    let error: any = null
    try {
      await applyPatchExecFile(tmpDir, patch, ['apply', '--whitespace=nowarn', '--recount', '--cached', '-'])
    } catch (err) {
      error = err
    }

    console.log('Stage untracked hunk error:', error ? error.message : 'NONE')
    expect(error).toBeNull()
  })

  test('Stage hunk on single-line file (single chunk)', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'single_line.txt'
    const fullPath = path.join(tmpDir, filePath)

    fs.writeFileSync(fullPath, 'hello world\n')
    await git.add(filePath)
    await git.commit('initial')

    fs.writeFileSync(fullPath, 'hello brave new world\n')

    const before = 'hello world'
    const after = 'hello brave new world'
    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(1)

    const patch = buildHunkPatch(filePath, hunks[0], 'stage')
    console.log('--- Patch for single-line file: ---\n', patch)

    await applyPatchExecFile(tmpDir, patch, ['apply', '--whitespace=nowarn', '--recount', '--cached', '-'])

    const indexContent = await git.show([`:${filePath}`])
    expect(indexContent.trim()).toBe('hello brave new world')
  })

  test('Stage hunk on empty tracked file (0 lines -> N lines)', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'empty_tracked.txt'
    const fullPath = path.join(tmpDir, filePath)

    // Initial commit of empty file
    fs.writeFileSync(fullPath, '')
    await git.add(filePath)
    await git.commit('initial empty')

    // Add lines
    fs.writeFileSync(fullPath, 'line 1\nline 2\n')

    const before = ''
    const after = 'line 1\nline 2'
    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(1)
    const patch = buildHunkPatch(filePath, hunks[0], 'stage')
    console.log('--- Patch for empty tracked file: ---\n', patch)

    let error: any = null
    try {
      await applyPatchExecFile(tmpDir, patch, ['apply', '--whitespace=nowarn', '--recount', '--cached', '-'])
    } catch (err) {
      error = err
    }

    console.log('Empty tracked file stage error:', error ? error.message : 'NONE')
    expect(error).toBeNull()
  })

  test('Stage hunk on completely deleted file (N lines -> 0 lines)', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'deleted_file.txt'
    const fullPath = path.join(tmpDir, filePath)

    fs.writeFileSync(fullPath, 'line 1\nline 2\nline 3\n')
    await git.add(filePath)
    await git.commit('initial')

    // Delete file content
    fs.writeFileSync(fullPath, '')

    const before = 'line 1\nline 2\nline 3'
    const after = ''
    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(1)
    const patch = buildHunkPatch(filePath, hunks[0], 'stage')
    console.log('--- Patch for completely deleted file: ---\n', patch)

    let error: any = null
    try {
      await applyPatchExecFile(tmpDir, patch, ['apply', '--whitespace=nowarn', '--recount', '--cached', '-'])
    } catch (err) {
      error = err
    }

    console.log('Completely deleted file stage error:', error ? error.message : 'NONE')
    expect(error).toBeNull()
  })

  test('Stage hunk with no newline at EOF', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'no_eof_newline.txt'
    const fullPath = path.join(tmpDir, filePath)

    fs.writeFileSync(fullPath, 'line 1\nline 2')
    await git.add(filePath)
    await git.commit('initial')

    fs.writeFileSync(fullPath, 'line 1\nline 2 modified')

    const before = 'line 1\nline 2'
    const after = 'line 1\nline 2 modified'
    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(1)
    const patch = buildHunkPatch(filePath, hunks[0], 'stage')
    console.log('--- Patch for no EOF newline: ---\n', patch)

    let error: any = null
    try {
      await gitService.applyPatch(tmpDir, patch, { cached: true })
    } catch (err) {
      error = err
    }

    console.log('No EOF newline stage error:', error ? error.message : 'NONE')
    expect(error).toBeNull()
  })

  test('Stage hunk with CRLF line endings', async () => {
    const filePath = 'crlf_file.txt'
    const fullPath = path.join(tmpDir, filePath)

    fs.writeFileSync(fullPath, 'line 1\r\nline 2\r\nline 3\r\n')
    const git = (gitService as any).getGitInstance ? (gitService as any).getGitInstance(tmpDir) : (await import('simple-git')).default(tmpDir)
    await git.add(filePath)
    await git.commit('initial')

    fs.writeFileSync(fullPath, 'line 1\r\nline 2 modified\r\nline 3\r\n')

    const before = 'line 1\r\nline 2\r\nline 3'
    const after = 'line 1\r\nline 2 modified\r\nline 3'
    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(1)
    const patch = buildHunkPatch(filePath, hunks[0], 'stage')
    console.log('--- Patch for CRLF file: ---\n', patch)

    let error: any = null
    try {
      await gitService.applyPatch(tmpDir, patch, { cached: true })
    } catch (err) {
      error = err
    }

    console.log('CRLF file stage error:', error ? error.message : 'NONE')
    expect(error).toBeNull()
  })

  test('Stage hunk on 1-line file deleted (1 line -> 0 lines)', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'delete_1_line.txt'
    const fullPath = path.join(tmpDir, filePath)

    fs.writeFileSync(fullPath, 'only line\n')
    await git.add(filePath)
    await git.commit('initial')

    fs.writeFileSync(fullPath, '')

    const before = 'only line'
    const after = ''
    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(1)
    const patch = buildHunkPatch(filePath, hunks[0], 'stage')
    console.log('--- Patch for 1-line file deleted: ---\n', patch)

    let error: any = null
    try {
      await gitService.applyPatch(tmpDir, patch, { cached: true })
    } catch (err) {
      error = err
    }

    console.log('1-line file deleted stage error:', error ? error.message : 'NONE')
    expect(error).toBeNull()
  })

  test('Stage single chunk on file in subdirectory with spaces', async () => {
    const git = simpleGit(tmpDir)
    const subDir = path.join(tmpDir, 'folder with spaces')
    fs.mkdirSync(subDir, { recursive: true })
    const filePath = 'folder with spaces/file with spaces.txt'
    const fullPath = path.join(tmpDir, filePath)

    fs.writeFileSync(fullPath, 'line 1\nline 2\nline 3\n')
    await git.add(filePath)
    await git.commit('initial')

    fs.writeFileSync(fullPath, 'line 1\nline 2 modified\nline 3\n')

    const before = 'line 1\nline 2\nline 3'
    const after = 'line 1\nline 2 modified\nline 3'
    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(1)
    const patch = buildHunkPatch(filePath, hunks[0], 'stage')
    console.log('--- Patch for file with spaces: ---\n', patch)

    let error: any = null
    try {
      await gitService.applyPatch(tmpDir, patch, { cached: true })
    } catch (err) {
      error = err
    }

    console.log('File with spaces stage error:', error ? error.message : 'NONE')
    expect(error).toBeNull()
  })

  test('Stage single chunk on untracked file in subdirectory with spaces', async () => {
    const subDir = path.join(tmpDir, 'untracked dir')
    fs.mkdirSync(subDir, { recursive: true })
    const filePath = 'untracked dir/new file.txt'
    const fullPath = path.join(tmpDir, filePath)

    fs.writeFileSync(fullPath, 'content A\ncontent B\n')

    const before = ''
    const after = 'content A\ncontent B'
    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(1)
    const patch = buildHunkPatch(filePath, hunks[0], 'stage')
    console.log('--- Patch for untracked in sub dir: ---\n', patch)

    let error: any = null
    try {
      await gitService.applyPatch(tmpDir, patch, { cached: true })
    } catch (err) {
      error = err
    }

    console.log('Untracked in sub dir stage error:', error ? error.message : 'NONE')
    expect(error).toBeNull()
  })

  test('Stage single chunk added at bottom of 20-line file', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'bottom_add.txt'
    const fullPath = path.join(tmpDir, filePath)

    const initialLines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join('\n') + '\n'
    fs.writeFileSync(fullPath, initialLines)
    await git.add(filePath)
    await git.commit('initial')

    const modifiedLines = initialLines + 'Line 21 added\nLine 22 added\n'
    fs.writeFileSync(fullPath, modifiedLines)

    const before = initialLines.trimEnd()
    const after = modifiedLines.trimEnd()
    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(1)
    const patch = buildHunkPatch(filePath, hunks[0], 'stage')
    console.log('--- Patch for bottom add: ---\n', patch)

    let error: any = null
    try {
      await gitService.applyPatch(tmpDir, patch, { cached: true })
    } catch (err) {
      error = err
    }

    console.log('Bottom add stage error:', error ? error.message : 'NONE')
    expect(error).toBeNull()
  })

  test('Stage single chunk with multiple modified lines separated within contextPadding', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'multi_close_lines.txt'
    const fullPath = path.join(tmpDir, filePath)

    const initial = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10'].join('\n') + '\n'
    fs.writeFileSync(fullPath, initial)
    await git.add(filePath)
    await git.commit('initial')

    // Modify L3 and L6 (within 2*3+1 = 7 lines of each other, grouped into 1 chunk)
    const modified = ['L1', 'L2', 'L3 mod', 'L4', 'L5', 'L6 mod', 'L7', 'L8', 'L9', 'L10'].join('\n') + '\n'
    fs.writeFileSync(fullPath, modified)

    const before = initial.trimEnd()
    const after = modified.trimEnd()
    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(1)
    const patch = buildHunkPatch(filePath, hunks[0], 'stage')
    console.log('--- Patch for multi close lines: ---\n', patch)

    let error: any = null
    try {
      await gitService.applyPatch(tmpDir, patch, { cached: true })
    } catch (err) {
      error = err
    }

    console.log('Multi close lines stage error:', error ? error.message : 'NONE')
    expect(error).toBeNull()
  })

  test('Stage single chunk when index has no trailing newline and working tree has trailing newline', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'eof_diff.txt'
    const fullPath = path.join(tmpDir, filePath)

    // No newline at EOF
    fs.writeFileSync(fullPath, 'line 1\nline 2')
    await git.add(filePath)
    await git.commit('initial')

    // Modified with newline at EOF
    fs.writeFileSync(fullPath, 'line 1\nline 2 modified\n')

    const before = 'line 1\nline 2'
    const after = 'line 1\nline 2 modified\n'
    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(1)
    const patch = buildHunkPatch(filePath, hunks[0], 'stage')
    console.log('--- Patch for EOF newline diff: ---\n', patch)

    let error: any = null
    try {
      await gitService.applyPatch(tmpDir, patch, { cached: true })
    } catch (err) {
      error = err
    }

    console.log('EOF newline diff stage error:', error ? error.message : 'NONE')
    expect(error).toBeNull()
  })

  test('Discard hunk on file with trailing newline when white line is added at line 1', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'CLAUDE.md'
    const fullPath = path.join(tmpDir, filePath)

    // Initial content with standard POSIX trailing newline
    const initialContent = '# Project\nSome description\n'
    fs.writeFileSync(fullPath, initialContent)
    await git.add(filePath)
    await git.commit('initial')

    // Added white/empty line at line 1
    const modifiedContent = '\n# Project\nSome description\n'
    fs.writeFileSync(fullPath, modifiedContent)

    const before = await git.show([`:${filePath}`])
    const after = fs.readFileSync(fullPath, 'utf8')

    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(1)
    const patch = buildHunkPatch(filePath, hunks[0], 'discard')

    let error: any = null
    try {
      await gitService.applyPatch(tmpDir, patch, { reverse: true })
    } catch (err) {
      error = err
    }

    expect(error).toBeNull()
    const contentAfterDiscard = fs.readFileSync(fullPath, 'utf8')
    expect(contentAfterDiscard).toBe(initialContent)
  })

  test('Discard hunk on file with trailing newline when white line is deleted at line 1', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'CLAUDE_del.md'
    const fullPath = path.join(tmpDir, filePath)

    // Initial content with white line at line 1
    const initialContent = '\n# Project\nSome description\n'
    fs.writeFileSync(fullPath, initialContent)
    await git.add(filePath)
    await git.commit('initial')

    // White line removed
    const modifiedContent = '# Project\nSome description\n'
    fs.writeFileSync(fullPath, modifiedContent)

    const before = await git.show([`:${filePath}`])
    const after = fs.readFileSync(fullPath, 'utf8')

    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(1)
    const patch = buildHunkPatch(filePath, hunks[0], 'discard')

    let error: any = null
    try {
      await gitService.applyPatch(tmpDir, patch, { reverse: true })
    } catch (err) {
      error = err
    }

    expect(error).toBeNull()
    const contentAfterDiscard = fs.readFileSync(fullPath, 'utf8')
    expect(contentAfterDiscard).toBe(initialContent)
  })

  test('Discard hunk on file with CRLF line endings', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'CLAUDE_crlf.md'
    const fullPath = path.join(tmpDir, filePath)

    // CRLF content
    const initialContent = '# Book API\r\nSome description\r\n'
    fs.writeFileSync(fullPath, initialContent)
    await git.add(filePath)
    await git.commit('initial')

    // Added white line at line 1 in CRLF
    const modifiedContent = '\r\n# Book API\r\nSome description\r\n'
    fs.writeFileSync(fullPath, modifiedContent)

    const before = await git.show([`:${filePath}`])
    const after = fs.readFileSync(fullPath, 'utf8')

    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(1)
    const patch = buildHunkPatch(filePath, hunks[0], 'discard')

    let error: any = null
    try {
      await gitService.applyPatch(tmpDir, patch, { reverse: true })
    } catch (err) {
      error = err
    }

    expect(error).toBeNull()
  })

  test('Discard hunk for pure whitespace change', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'CLAUDE_ws.md'
    const fullPath = path.join(tmpDir, filePath)

    const initialContent = '# Project\nLine 2\n'
    fs.writeFileSync(fullPath, initialContent)
    await git.add(filePath)
    await git.commit('initial')

    // Trailing spaces added to line 1
    const modifiedContent = '# Project  \nLine 2\n'
    fs.writeFileSync(fullPath, modifiedContent)

    const before = await git.show([`:${filePath}`])
    const after = fs.readFileSync(fullPath, 'utf8')

    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(1)
    const patch = buildHunkPatch(filePath, hunks[0], 'discard')

    let error: any = null
    try {
      await gitService.applyPatch(tmpDir, patch, { reverse: true })
    } catch (err) {
      error = err
    }

    expect(error).toBeNull()
    const contentAfterDiscard = fs.readFileSync(fullPath, 'utf8')
    expect(contentAfterDiscard).toBe(initialContent)
  })

  test('Discard hunk 2 first on file with multiple hunks and trailing newlines', async () => {
    const git = simpleGit(tmpDir)
    const filePath = 'CLAUDE_multi.md'
    const fullPath = path.join(tmpDir, filePath)

    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`)
    fs.writeFileSync(fullPath, lines.join('\n') + '\n')
    await git.add(filePath)
    await git.commit('initial')

    const modifiedLines = ['Top added 1', 'Top added 2', ...lines]
    modifiedLines[16] = 'Line 15 changed'
    fs.writeFileSync(fullPath, modifiedLines.join('\n') + '\n')

    const before = await git.show([`:${filePath}`])
    const after = fs.readFileSync(fullPath, 'utf8')

    const diffItems = computeDiff(before, after)
    const hunks = buildHunksFromDiffItems(diffItems)

    expect(hunks.length).toBe(2)
    const patch = buildHunkPatch(filePath, hunks[1], 'discard')

    let error: any = null
    try {
      await gitService.applyPatch(tmpDir, patch, { reverse: true })
    } catch (err) {
      error = err
    }

    expect(error).toBeNull()
  })
})





