import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import { execFile } from 'child_process'
import simpleGit from 'simple-git'
import { buildHunksFromDiffItems, buildHunkPatch, DiffItem } from '../../renderer/src/utils/patchBuilder'

function computeDiff(beforeContent: string = '', afterContent: string = ''): DiffItem[] {
  const safeBefore = beforeContent || ''
  const safeAfter = afterContent || ''
  const beforeLines = safeBefore === '' ? [] : safeBefore.split(/\r?\n/)
  const afterLines = safeAfter === '' ? [] : safeAfter.split(/\r?\n/)

  let prefixCount = 0
  while (
    prefixCount < beforeLines.length &&
    prefixCount < afterLines.length &&
    beforeLines[prefixCount] === afterLines[prefixCount]
  ) {
    prefixCount++
  }

  let suffixCount = 0
  while (
    suffixCount < beforeLines.length - prefixCount &&
    suffixCount < afterLines.length - prefixCount &&
    beforeLines[beforeLines.length - 1 - suffixCount] === afterLines[afterLines.length - 1 - suffixCount]
  ) {
    suffixCount++
  }

  const midBefore = beforeLines.slice(prefixCount, beforeLines.length - suffixCount)
  const midAfter = afterLines.slice(prefixCount, afterLines.length - suffixCount)

  const db: number[][] = Array(midBefore.length + 1)
    .fill(null)
    .map(() => Array(midAfter.length + 1).fill(0))

  for (let i = 1; i <= midBefore.length; i++) {
    for (let j = 1; j <= midAfter.length; j++) {
      if (midBefore[i - 1] === midAfter[j - 1]) {
        db[i][j] = db[i - 1][j - 1] + 1
      } else {
        db[i][j] = Math.max(db[i - 1][j], db[i][j - 1])
      }
    }
  }

  let i = midBefore.length
  let j = midAfter.length
  const midDiff: DiffItem[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && midBefore[i - 1] === midAfter[j - 1]) {
      midDiff.unshift({
        type: 'normal',
        beforeLine: midBefore[i - 1],
        afterLine: midAfter[j - 1],
        beforeNum: prefixCount + i,
        afterNum: prefixCount + j
      })
      i--
      j--
    } else if (j > 0 && (i === 0 || db[i][j - 1] >= db[i - 1][j])) {
      midDiff.unshift({
        type: 'add',
        afterLine: midAfter[j - 1],
        afterNum: prefixCount + j
      })
      j--
    } else {
      midDiff.unshift({
        type: 'delete',
        beforeLine: midBefore[i - 1],
        beforeNum: prefixCount + i
      })
      i--
    }
  }

  const prefixDiff: DiffItem[] = beforeLines.slice(0, prefixCount).map((line, idx) => ({
    type: 'normal',
    beforeLine: line,
    afterLine: line,
    beforeNum: idx + 1,
    afterNum: idx + 1
  }))

  const suffixDiff: DiffItem[] = beforeLines
    .slice(beforeLines.length - suffixCount)
    .map((line, idx) => ({
      type: 'normal',
      beforeLine: line,
      afterLine: line,
      beforeNum: beforeLines.length - suffixCount + idx + 1,
      afterNum: afterLines.length - suffixCount + idx + 1
    }))

  return [...prefixDiff, ...midDiff, ...suffixDiff]
}

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
})
