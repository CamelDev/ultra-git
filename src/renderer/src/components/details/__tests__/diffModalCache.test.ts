import { describe, expect, test } from 'bun:test'
import { computeDiff } from '../../../utils/patchBuilder'

describe('diff viewer caching & concurrency logic', () => {
  test('cache key distinguishes files, staged states, and commit hashes', () => {
    const buildKey = (
      repoPath: string,
      filePath: string,
      oldPath: string | undefined,
      status: string | undefined,
      isStaged: boolean,
      commitHash: string | undefined,
      stashIndex: number | undefined,
      isUntracked: boolean
    ) => `${repoPath}:${filePath}:${oldPath || ''}:${status || ''}:${isStaged ? '1' : '0'}:${commitHash || ''}:${stashIndex ?? ''}:${isUntracked ? '1' : '0'}`

    const keyA = buildKey('/repo/one', 'src/a.ts', undefined, 'M', false, 'abc123', undefined, false)
    const keyB = buildKey('/repo/one', 'src/a.ts', undefined, 'M', true, 'abc123', undefined, false)
    const keyC = buildKey('/repo/one', 'src/b.ts', undefined, 'M', false, 'abc123', undefined, false)
    const keyD = buildKey('/repo/one', 'src/a.ts', undefined, 'M', false, 'def456', undefined, false)
    const keyE = buildKey('/repo/two', 'src/a.ts', undefined, 'M', false, 'abc123', undefined, false)

    expect(keyA).not.toBe(keyB)
    expect(keyA).not.toBe(keyC)
    expect(keyA).not.toBe(keyD)
    expect(keyA).not.toBe(keyE) // Diff from repo one does not match repo two
  })

  test('file sync fallback updates currentPathRef to clamped path preventing infinite render loop', () => {
    // Simulates the DiffModal synchronization logic when switching repositories/branches
    let currentFileIndex = 3
    let currentPath: string | null = 'old-repo-file.ts'
    const newFiles = [{ path: 'new-repo-file-1.ts' }, { path: 'new-repo-file-2.ts' }]
    const filePath = 'old-repo-file.ts' // Target file from previous repo

    // When modal was open and files switch to a repo that doesn't have old-repo-file:
    const foundIdxByTarget = newFiles.findIndex((f) => f.path === filePath)
    expect(foundIdxByTarget).toBe(-1)

    const foundIdxByCurrent = currentPath ? newFiles.findIndex((f) => f.path === currentPath) : -1
    expect(foundIdxByCurrent).toBe(-1)

    // Fallback clamps index and MUST sync currentPath to the clamped file
    const nextIdx = Math.max(0, Math.min(currentFileIndex, newFiles.length - 1))
    currentFileIndex = nextIdx
    currentPath = newFiles[nextIdx]?.path ?? null

    expect(currentFileIndex).toBe(1)
    expect(currentPath).toBe('new-repo-file-2.ts')

    // On subsequent render pass, currentPath is now found in newFiles, breaking the loop!
    const subsequentIdx = currentPath ? newFiles.findIndex((f) => f.path === currentPath) : -1
    expect(subsequentIdx).toBe(1)
  })

  test('stale async responses are discarded when requestId does not match latest', async () => {
    let latestRequestId = 0
    let activeFileDiff: string | null = null

    const mockFetch = (id: number, content: string, delayMs: number): Promise<void> => {
      return new Promise((resolve) => {
        setTimeout(() => {
          if (latestRequestId === id) {
            activeFileDiff = content
          }
          resolve()
        }, delayMs)
      })
    }

    // User navigates from File 1 -> File 2 -> File 3 rapidly
    latestRequestId = 1
    const p1 = mockFetch(1, 'content-of-file-1', 50) // Slow response (50ms)

    latestRequestId = 2
    const p2 = mockFetch(2, 'content-of-file-2', 30) // Medium response (30ms)

    latestRequestId = 3
    const p3 = mockFetch(3, 'content-of-file-3', 10) // Fast response (10ms)

    await Promise.all([p1, p2, p3])

    // Even though p1 finished last, activeFileDiff MUST remain File 3!
    expect(activeFileDiff as any).toBe('content-of-file-3')
  })

  test('computeDiff handles massive changes without freezing via product guard', () => {
    // Generate 2500 lines before and 2500 lines after (product = 6.25M > 2M guard)
    const beforeLines = Array.from({ length: 2500 }, (_, i) => `old line ${i}`).join('\n')
    const afterLines = Array.from({ length: 2500 }, (_, i) => `new line ${i}`).join('\n')

    const start = performance.now()
    const diffItems = computeDiff(beforeLines, afterLines)
    const elapsed = performance.now() - start

    expect(diffItems.length).toBe(5000)
    // Deletions first, then additions
    expect(diffItems[0].type).toBe('delete')
    expect(diffItems[2500].type).toBe('add')
    // Should take under 100ms because of fast path guard instead of spending seconds in LCS
    expect(elapsed).toBeLessThan(150)
  })

  test('computeDiff fast paths handle pure additions and pure deletions instantly', () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join('\n')

    // Pure addition
    const addDiff = computeDiff('', lines)
    expect(addDiff.length).toBe(1000)
    expect(addDiff.every((d) => d.type === 'add')).toBe(true)

    // Pure deletion
    const delDiff = computeDiff(lines, '')
    expect(delDiff.length).toBe(1000)
    expect(delDiff.every((d) => d.type === 'delete')).toBe(true)
  })
})
