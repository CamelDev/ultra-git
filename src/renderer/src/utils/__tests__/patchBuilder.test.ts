import { describe, test, expect } from 'bun:test'
import {
  buildHunksFromDiffItems,
  buildHunkPatch,
  buildSelectedLinesPatch,
  DiffItem
} from '../patchBuilder'

describe('patchBuilder utility', () => {
  test('buildHunksFromDiffItems correctly groups changes into hunks', () => {
    const diffItems: DiffItem[] = [
      { type: 'normal', beforeLine: 'line 1', afterLine: 'line 1', beforeNum: 1, afterNum: 1 },
      { type: 'normal', beforeLine: 'line 2', afterLine: 'line 2', beforeNum: 2, afterNum: 2 },
      { type: 'delete', beforeLine: 'old line 3', beforeNum: 3 },
      { type: 'add', afterLine: 'new line 3', afterNum: 3 },
      { type: 'normal', beforeLine: 'line 4', afterLine: 'line 4', beforeNum: 4, afterNum: 4 },
      { type: 'normal', beforeLine: 'line 5', afterLine: 'line 5', beforeNum: 5, afterNum: 5 }
    ]

    const hunks = buildHunksFromDiffItems(diffItems, 2)
    expect(hunks.length).toBe(1)
    expect(hunks[0].oldStart).toBe(1)
    expect(hunks[0].oldCount).toBe(5)
    expect(hunks[0].newStart).toBe(1)
    expect(hunks[0].newCount).toBe(5)
    expect(hunks[0].header).toBe('@@ -1,5 +1,5 @@')
  })

  test('buildHunkPatch generates valid unified diff patch for a hunk', () => {
    const diffItems: DiffItem[] = [
      { type: 'normal', beforeLine: 'line 1', afterLine: 'line 1', beforeNum: 1, afterNum: 1 },
      { type: 'delete', beforeLine: 'old line 2', beforeNum: 2 },
      { type: 'add', afterLine: 'new line 2', afterNum: 2 },
      { type: 'normal', beforeLine: 'line 3', afterLine: 'line 3', beforeNum: 3, afterNum: 3 }
    ]

    const hunks = buildHunksFromDiffItems(diffItems, 1)
    const patch = buildHunkPatch('src/app.ts', hunks[0])

    expect(patch).toContain('--- a/src/app.ts')
    expect(patch).toContain('+++ b/src/app.ts')
    expect(patch).toContain('@@ -1,3 +1,3 @@')
    expect(patch).toContain('-old line 2')
    expect(patch).toContain('+new line 2')
  })

  test('buildSelectedLinesPatch transforms unselected changes accurately', () => {
    const diffItems: DiffItem[] = [
      { type: 'normal', beforeLine: 'line 1', afterLine: 'line 1', beforeNum: 1, afterNum: 1 },
      { type: 'delete', beforeLine: 'old line 2', beforeNum: 2 },
      { type: 'add', afterLine: 'new line 2', afterNum: 2 },
      { type: 'add', afterLine: 'added line 3', afterNum: 3 },
      { type: 'normal', beforeLine: 'line 3', afterLine: 'line 4', beforeNum: 3, afterNum: 4 }
    ]

    const hunks = buildHunksFromDiffItems(diffItems, 1)
    // Select only 'new line 2' (index 2)
    const selectedIndices = new Set<number>([2])

    const patch = buildSelectedLinesPatch('src/app.ts', hunks[0], selectedIndices)

    // 'old line 2' (unselected delete) should be converted to context line
    expect(patch).toContain(' old line 2')
    // 'new line 2' (selected add) should be kept as addition
    expect(patch).toContain('+new line 2')
    // 'added line 3' (unselected add) should be omitted
    expect(patch).not.toContain('added line 3')
  })
})
